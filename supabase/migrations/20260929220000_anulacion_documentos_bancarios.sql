-- Anulación atómica de documentos bancarios (cheques y demás documentos de banco)
--
-- Reemplaza los pasos sueltos que VoidChequeDialog ejecutaba desde el navegador
-- (numeración REV, inserts de cabecera y líneas, upsert del documento VOID) por
-- funciones transaccionales en la base.
--
-- Contenido:
--   1. next_bank_document_number(bigint, bigint, text)      → sugerencia del siguiente número
--   2. void_bank_document(bigint, date, text, boolean, date, text)
--   3. void_bank_document_number(bigint, bigint, text, text, date, text, text, text, date)
--   4. undo_void_bank_document(bigint)
--   5. delete_draft_journal_entry(bigint)                    → bloquea REV de documento bancario y limpia enlaces
--   6. Trigger audit_bank_documents en tab_bank_documents (audit_trigger_function)
--
-- Se aplica manualmente vía MCP y se registra en supabase_migrations.schema_migrations.
-- Idempotente (CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
--
-- Convenciones respetadas:
--   * original.reversal_entry_id = REV.id  y  REV.reversed_by_entry_id = original.id
--     (igual que VoidEntryDialog y reopen_journal_entry).
--   * tab_journal_entries.bank_account_id es la cuenta CONTABLE (tab_accounts.id);
--     tab_bank_documents.bank_account_id es tab_bank_accounts.id.
--   * Actualizar reversal_entry_id de una partida contabilizada es un cambio no
--     contable permitido por enforce_journal_entry_immutability.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. next_bank_document_number
--    Último número de la cuenta sin importar el mes: máximo del mismo prefijo entre
--    los últimos 200 registros de tab_journal_entries (bank_reference; sin REV-% ni
--    borrados) y de tab_bank_documents (incluye VOID: un anulado también quema el
--    número). Conserva ceros a la izquierda. NULL si no hay nada parseable.
--    La serie (prefijo) la define el registro más reciente, dando prioridad a las
--    partidas y luego a los documentos, igual que la sugerencia anterior del navegador.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_bank_document_number(
  p_enterprise_id bigint,
  p_bank_gl_account_id bigint,
  p_direction text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_dir          text := upper(COALESCE(NULLIF(btrim(p_direction), ''), 'OUT'));
  v_bank_acct_id bigint;
  v_prefix       text;
  v_max          numeric;
  v_width        integer;
  v_next         text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(v_uid) OR public.user_is_linked_to_enterprise(v_uid, p_enterprise_id)) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa' USING ERRCODE = '42501';
  END IF;
  IF p_bank_gl_account_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ba.id INTO v_bank_acct_id
    FROM public.tab_bank_accounts ba
   WHERE ba.enterprise_id = p_enterprise_id
     AND ba.account_id = p_bank_gl_account_id
   ORDER BY ba.id
   LIMIT 1;

  WITH je AS (
    SELECT btrim(e.bank_reference) AS ref, 1 AS src,
           row_number() OVER (ORDER BY e.entry_date DESC, e.created_at DESC NULLS LAST, e.id DESC) AS rn
      FROM public.tab_journal_entries e
     WHERE e.enterprise_id = p_enterprise_id
       AND e.bank_account_id = p_bank_gl_account_id
       AND e.bank_direction = v_dir
       AND e.bank_reference IS NOT NULL
       AND e.deleted_at IS NULL
       AND e.entry_number NOT LIKE 'REV-%'
     ORDER BY e.entry_date DESC, e.created_at DESC NULLS LAST, e.id DESC
     LIMIT 200
  ),
  bd AS (
    SELECT btrim(d.document_number) AS ref, 2 AS src,
           row_number() OVER (ORDER BY d.document_date DESC, d.created_at DESC, d.id DESC) AS rn
      FROM public.tab_bank_documents d
     WHERE v_bank_acct_id IS NOT NULL
       AND d.enterprise_id = p_enterprise_id
       AND d.bank_account_id = v_bank_acct_id
       AND d.direction = v_dir
     ORDER BY d.document_date DESC, d.created_at DESC, d.id DESC
     LIMIT 200
  ),
  refs AS (
    SELECT u.src, u.rn, u.ref, substring(u.ref FROM '(\d+)$') AS digits
      FROM (SELECT * FROM je UNION ALL SELECT * FROM bd) u
  ),
  parsed AS (
    SELECT src, rn, digits,
           left(ref, length(ref) - length(digits)) AS prefix
      FROM refs
     WHERE digits IS NOT NULL
  ),
  seed AS (
    SELECT prefix FROM parsed ORDER BY src, rn LIMIT 1
  )
  SELECT s.prefix,
         max(p.digits::numeric),
         (array_agg(length(p.digits) ORDER BY p.digits::numeric DESC, length(p.digits) DESC))[1]
    INTO v_prefix, v_max, v_width
    FROM seed s
    JOIN parsed p ON p.prefix = s.prefix
   GROUP BY s.prefix;

  IF v_max IS NULL THEN
    RETURN NULL;
  END IF;

  v_next := (v_max + 1)::text;
  RETURN v_prefix || lpad(v_next, GREATEST(v_width, length(v_next)), '0');
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. void_bank_document
--    Anula el documento bancario de una partida guardada.
--    * Contabilizada: crea la REV en BORRADOR (nunca la contabiliza) fechada el día
--      de la anulación, enlaza original ↔ REV, desvincula las facturas y registra el
--      documento como VOID. Opcionalmente crea un borrador de reemplazo con las
--      mismas líneas y re-vincula ahí las facturas.
--    * Borrador: no crea REV ni desvincula facturas. Con reemplazo, reutiliza la
--      misma partida cambiando su número de documento.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_bank_document(
  p_entry_id bigint,
  p_void_date date,
  p_reason text,
  p_create_replacement boolean DEFAULT false,
  p_replacement_date date DEFAULT NULL,
  p_replacement_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid              uuid := auth.uid();
  v_entry            public.tab_journal_entries%ROWTYPE;
  v_reason           text := btrim(COALESCE(p_reason, ''));
  v_number           text;
  v_direction        text;
  v_is_posted        boolean;
  v_bank_acct_id     bigint;
  v_warning          text;
  v_period           public.tab_accounting_periods%ROWTYPE;
  v_rev_id           bigint;
  v_rev_number       text;
  v_rev_prefix       text;
  v_rev_seq          integer;
  v_line_count       integer;
  v_all_purchase_ids bigint[] := '{}';
  v_purchase_ids     bigint[] := '{}';
  v_doc_id           bigint;
  v_repl_id          bigint;
  v_repl_entry_number text;
  v_repl_doc_number  text;
  v_repl_date        date;
  v_dup_entry        text;
  v_dup_doc_status   text;
BEGIN
  -- ── 1. Validaciones ─────────────────────────────────────────────────────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Debe indicar el motivo de la anulación (mínimo 3 caracteres).';
  END IF;
  IF p_void_date IS NULL THEN
    RAISE EXCEPTION 'Debe indicar la fecha de anulación.';
  END IF;

  -- Bloqueo de la partida: una segunda anulación simultánea espera aquí y, al
  -- continuar, ve el reversal_entry_id / documento VOID ya confirmados.
  SELECT * INTO v_entry FROM public.tab_journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND OR v_entry.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Partida no encontrada.';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises ue
       WHERE ue.user_id = v_uid AND ue.enterprise_id = v_entry.enterprise_id AND ue.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role_permission(v_uid, v_entry.enterprise_id, 'void_entries') THEN
    RAISE EXCEPTION 'No tiene permiso para anular documentos (permiso "Anular Partidas").' USING ERRCODE = '42501';
  END IF;

  v_number := NULLIF(btrim(v_entry.bank_reference), '');
  IF v_entry.bank_account_id IS NULL OR v_number IS NULL THEN
    RAISE EXCEPTION 'La partida no tiene cuenta bancaria y número de documento; no hay documento que anular.';
  END IF;
  IF v_entry.entry_type IN ('apertura', 'cierre') THEN
    RAISE EXCEPTION 'No se pueden anular documentos de partidas de apertura o cierre.';
  END IF;
  IF v_entry.reversed_by_entry_id IS NOT NULL OR v_entry.entry_number LIKE 'REV-%' THEN
    RAISE EXCEPTION 'La partida % es una reversión; no se puede anular su documento.', v_entry.entry_number;
  END IF;
  IF v_entry.reversal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'La partida % ya fue anulada o revertida (reversión %).',
      v_entry.entry_number,
      COALESCE((SELECT entry_number FROM public.tab_journal_entries WHERE id = v_entry.reversal_entry_id), v_entry.reversal_entry_id::text);
  END IF;
  IF p_void_date < v_entry.entry_date THEN
    RAISE EXCEPTION 'La fecha de anulación (%) no puede ser anterior a la fecha de la partida (%).',
      to_char(p_void_date, 'DD/MM/YYYY'), to_char(v_entry.entry_date, 'DD/MM/YYYY');
  END IF;

  -- Bloqueo por (empresa, cuenta, número): serializa con void_bank_document_number
  -- y con cualquier otra anulación del mismo número.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'bank_doc:' || v_entry.enterprise_id || ':' || v_entry.bank_account_id || ':' || v_number, 0));

  v_direction := CASE WHEN v_entry.bank_direction IN ('IN', 'OUT') THEN v_entry.bank_direction ELSE 'OUT' END;

  SELECT ba.id INTO v_bank_acct_id
    FROM public.tab_bank_accounts ba
   WHERE ba.enterprise_id = v_entry.enterprise_id AND ba.account_id = v_entry.bank_account_id
   ORDER BY ba.id
   LIMIT 1;

  IF v_bank_acct_id IS NULL THEN
    v_warning := 'La cuenta contable no tiene una cuenta registrada en Bancos: el documento anulado se guardó sin cuenta bancaria y no aparecerá en el Libro de Bancos de esa cuenta.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tab_bank_documents d
     WHERE d.enterprise_id = v_entry.enterprise_id
       AND d.bank_account_id IS NOT DISTINCT FROM v_bank_acct_id
       AND d.document_number = v_number
       AND d.status = 'VOID'
  ) THEN
    RAISE EXCEPTION 'El documento % ya está registrado como ANULADO.', v_number;
  END IF;

  v_is_posted := COALESCE(v_entry.is_posted, false) OR v_entry.status = 'contabilizado';

  IF v_is_posted THEN
    -- ── 2. Partida contabilizada ──────────────────────────────────────────────
    SELECT * INTO v_period
      FROM public.tab_accounting_periods ap
     WHERE ap.enterprise_id = v_entry.enterprise_id
       AND p_void_date BETWEEN ap.start_date AND ap.end_date
     ORDER BY (ap.status = 'abierto') DESC, ap.start_date DESC
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No existe un período contable para la fecha de anulación %. Cree el período % antes de anular.',
        to_char(p_void_date, 'DD/MM/YYYY'), EXTRACT(YEAR FROM p_void_date)::int;
    END IF;
    IF v_period.status IS DISTINCT FROM 'abierto' THEN
      RAISE EXCEPTION 'El período % está cerrado. Elija una fecha de anulación dentro de un período abierto.', v_period.year;
    END IF;

    -- Número REV-YYYY-MM-NNNN del mes de la anulación. Interpreta correlativos de 3 y
    -- 4 dígitos (REV legados como REV-2026-05-003) y toma el máximo + 1.
    v_rev_prefix := 'REV-' || to_char(p_void_date, 'YYYY-MM') || '-';
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'rev_number:' || v_entry.enterprise_id || ':' || to_char(p_void_date, 'YYYY-MM'), 0));
    SELECT COALESCE(MAX((substring(e.entry_number FROM '^REV-\d{4}-\d{2}-(\d+)$'))::integer), 0) + 1
      INTO v_rev_seq
      FROM public.tab_journal_entries e
     WHERE e.enterprise_id = v_entry.enterprise_id
       AND e.entry_number LIKE v_rev_prefix || '%';
    v_rev_number := v_rev_prefix || lpad(v_rev_seq::text, GREATEST(4, length(v_rev_seq::text)), '0');

    INSERT INTO public.tab_journal_entries (
      enterprise_id, entry_number, entry_date, entry_type, description,
      total_debit, total_credit, is_posted, status, document_reference,
      bank_account_id, bank_reference, beneficiary_name, bank_direction,
      currency_code, currency_id, exchange_rate, accounting_period_id,
      reversed_by_entry_id, created_by
    ) VALUES (
      v_entry.enterprise_id, v_rev_number, p_void_date, 'ajuste',
      'ANULACIÓN DOCUMENTO ' || v_number || ' (' || v_entry.entry_number || '): ' || v_reason,
      v_entry.total_credit, v_entry.total_debit, false, 'borrador', 'REF: ' || v_entry.entry_number,
      v_entry.bank_account_id, v_number, v_entry.beneficiary_name, NULL,
      v_entry.currency_code, v_entry.currency_id, v_entry.exchange_rate, v_period.id,
      v_entry.id, v_uid
    )
    RETURNING id INTO v_rev_id;

    -- Líneas invertidas. No se copian source_type/source_id/source_ref: la REV no es
    -- el documento de origen de ninguna factura.
    INSERT INTO public.tab_journal_entry_details (
      journal_entry_id, line_number, account_id, description,
      debit_amount, credit_amount, original_debit, original_credit,
      cost_center, bank_reference, is_bank_line, currency_code, exchange_rate
    )
    SELECT v_rev_id,
           row_number() OVER (ORDER BY d.line_number, d.id),
           d.account_id,
           'Anulación ' || v_number || ': ' || COALESCE(d.description, ''),
           COALESCE(d.credit_amount, 0), COALESCE(d.debit_amount, 0),
           d.original_credit, d.original_debit,
           d.cost_center, d.bank_reference, COALESCE(d.is_bank_line, false),
           d.currency_code, d.exchange_rate
      FROM public.tab_journal_entry_details d
     WHERE d.journal_entry_id = v_entry.id
       AND d.deleted_at IS NULL;
    GET DIAGNOSTICS v_line_count = ROW_COUNT;
    IF v_line_count = 0 THEN
      RAISE EXCEPTION 'La partida % no tiene líneas de detalle.', v_entry.entry_number;
    END IF;

    UPDATE public.tab_journal_entries
       SET reversal_entry_id = v_rev_id,
           updated_by = v_uid,
           updated_at = now()
     WHERE id = v_entry.id;

    -- Desvincular facturas: vínculos en tab_purchase_journal_links y vínculos
    -- legados (journal_entry_id directo en el libro).
    SELECT COALESCE(array_agg(DISTINCT x.pid), '{}')
      INTO v_all_purchase_ids
      FROM (
        SELECT l.purchase_id AS pid FROM public.tab_purchase_journal_links l WHERE l.journal_entry_id = v_entry.id
        UNION
        SELECT p.id FROM public.tab_purchase_ledger p WHERE p.journal_entry_id = v_entry.id
      ) x;

    SELECT COALESCE(array_agg(p.id ORDER BY p.id), '{}')
      INTO v_purchase_ids
      FROM public.tab_purchase_ledger p
     WHERE p.id = ANY (v_all_purchase_ids)
       AND p.deleted_at IS NULL;

    -- El trigger sync_purchase_journal_entry_id deja journal_entry_id en NULL.
    DELETE FROM public.tab_purchase_journal_links WHERE journal_entry_id = v_entry.id;

    UPDATE public.tab_purchase_ledger
       SET journal_entry_id = NULL,
           batch_reference  = NULL,
           bank_account_id  = NULL
     WHERE id = ANY (v_all_purchase_ids)
       AND (journal_entry_id IS NULL OR journal_entry_id = v_entry.id);
  ELSE
    -- ── 3. Partida en borrador ────────────────────────────────────────────────
    -- Sin REV ni desvinculación. El reemplazo (si se pide) reutiliza la partida.
    NULL;
  END IF;

  -- ── 4. Documento VOID (upsert NULL-safe en bank_account_id) ─────────────────
  -- journal_entry_id apunta a la partida original solo si estaba contabilizada. En
  -- un borrador queda NULL: la partida puede renumerarse y contabilizarse después,
  -- y el Libro de Bancos no debe fusionar ese movimiento con la fila anulada.
  SELECT d.id INTO v_doc_id
    FROM public.tab_bank_documents d
   WHERE d.enterprise_id = v_entry.enterprise_id
     AND d.bank_account_id IS NOT DISTINCT FROM v_bank_acct_id
     AND d.document_number = v_number
   FOR UPDATE;

  IF v_doc_id IS NOT NULL THEN
    UPDATE public.tab_bank_documents
       SET direction = v_direction,
           document_date = v_entry.entry_date,
           beneficiary_name = v_entry.beneficiary_name,
           concept = v_entry.description,
           status = 'VOID',
           void_date = p_void_date,
           void_reason = v_reason,
           journal_entry_id = CASE WHEN v_is_posted THEN v_entry.id ELSE NULL END,
           reversal_journal_entry_id = v_rev_id
     WHERE id = v_doc_id;
  ELSE
    INSERT INTO public.tab_bank_documents (
      enterprise_id, bank_account_id, document_number, direction, document_date,
      beneficiary_name, concept, status, void_date, void_reason,
      journal_entry_id, reversal_journal_entry_id, created_by
    ) VALUES (
      v_entry.enterprise_id, v_bank_acct_id, v_number, v_direction, v_entry.entry_date,
      v_entry.beneficiary_name, v_entry.description, 'VOID', p_void_date, v_reason,
      CASE WHEN v_is_posted THEN v_entry.id ELSE NULL END, v_rev_id, v_uid
    )
    RETURNING id INTO v_doc_id;
  END IF;

  -- ── 5. Documento de reemplazo ───────────────────────────────────────────────
  IF COALESCE(p_create_replacement, false) THEN
    -- Se calcula después del upsert VOID para que el número anulado cuente como usado.
    v_repl_doc_number := COALESCE(
      NULLIF(btrim(p_replacement_number), ''),
      public.next_bank_document_number(v_entry.enterprise_id, v_entry.bank_account_id, v_direction)
    );
    IF v_repl_doc_number IS NULL THEN
      RAISE EXCEPTION 'No se pudo sugerir un número para el documento de reemplazo; indíquelo manualmente.';
    END IF;
    IF v_repl_doc_number = v_number THEN
      RAISE EXCEPTION 'El documento de reemplazo no puede usar el número anulado (%).', v_number;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      'bank_doc:' || v_entry.enterprise_id || ':' || v_entry.bank_account_id || ':' || v_repl_doc_number, 0));

    SELECT e.entry_number INTO v_dup_entry
      FROM public.tab_journal_entries e
     WHERE e.enterprise_id = v_entry.enterprise_id
       AND e.bank_account_id = v_entry.bank_account_id
       AND e.bank_reference = v_repl_doc_number
       AND e.deleted_at IS NULL
       AND e.entry_number NOT LIKE 'REV-%'
       AND e.id <> v_entry.id
     LIMIT 1;
    IF v_dup_entry IS NOT NULL THEN
      RAISE EXCEPTION 'El número % ya está usado por la partida %.', v_repl_doc_number, v_dup_entry;
    END IF;

    SELECT d.status INTO v_dup_doc_status
      FROM public.tab_bank_documents d
     WHERE d.enterprise_id = v_entry.enterprise_id
       AND d.bank_account_id IS NOT DISTINCT FROM v_bank_acct_id
       AND d.document_number = v_repl_doc_number
     LIMIT 1;
    IF v_dup_doc_status IS NOT NULL THEN
      RAISE EXCEPTION 'El número % ya está registrado en Bancos (estado %).', v_repl_doc_number, v_dup_doc_status;
    END IF;

    IF v_is_posted THEN
      v_repl_date := COALESCE(p_replacement_date, p_void_date);

      SELECT * INTO v_period
        FROM public.tab_accounting_periods ap
       WHERE ap.enterprise_id = v_entry.enterprise_id
         AND v_repl_date BETWEEN ap.start_date AND ap.end_date
       ORDER BY (ap.status = 'abierto') DESC, ap.start_date DESC
       LIMIT 1;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe un período contable para la fecha del reemplazo %.', to_char(v_repl_date, 'DD/MM/YYYY');
      END IF;
      IF v_period.status IS DISTINCT FROM 'abierto' THEN
        RAISE EXCEPTION 'El período % está cerrado. Elija una fecha de reemplazo dentro de un período abierto.', v_period.year;
      END IF;

      v_repl_entry_number := public.allocate_journal_entry_number(v_entry.enterprise_id, v_entry.entry_type, v_repl_date);

      INSERT INTO public.tab_journal_entries (
        enterprise_id, entry_number, entry_date, entry_type, description,
        total_debit, total_credit, is_posted, status,
        document_reference, document_references,
        bank_account_id, bank_reference, beneficiary_name, bank_direction,
        currency_code, currency_id, exchange_rate, accounting_period_id, created_by
      ) VALUES (
        v_entry.enterprise_id, v_repl_entry_number, v_repl_date, v_entry.entry_type, v_entry.description,
        v_entry.total_debit, v_entry.total_credit, false, 'borrador',
        v_entry.document_reference, v_entry.document_references,
        v_entry.bank_account_id, v_repl_doc_number, v_entry.beneficiary_name, v_entry.bank_direction,
        v_entry.currency_code, v_entry.currency_id, v_entry.exchange_rate, v_period.id, v_uid
      )
      RETURNING id INTO v_repl_id;

      -- Todas las líneas de la original, esta vez con source_*.
      INSERT INTO public.tab_journal_entry_details (
        journal_entry_id, line_number, account_id, description,
        debit_amount, credit_amount, original_debit, original_credit,
        cost_center, bank_reference, is_bank_line, currency_code, exchange_rate,
        source_type, source_id, source_ref
      )
      SELECT v_repl_id,
             row_number() OVER (ORDER BY d.line_number, d.id),
             d.account_id, d.description,
             d.debit_amount, d.credit_amount, d.original_debit, d.original_credit,
             d.cost_center,
             CASE WHEN d.bank_reference = v_number THEN v_repl_doc_number ELSE d.bank_reference END,
             COALESCE(d.is_bank_line, false), d.currency_code, d.exchange_rate,
             d.source_type, d.source_id, d.source_ref
        FROM public.tab_journal_entry_details d
       WHERE d.journal_entry_id = v_entry.id
         AND d.deleted_at IS NULL;

      -- Re-vincular las facturas desvinculadas en el paso 2 (el trigger de vínculos
      -- pone journal_entry_id; aquí se completan batch_reference y bank_account_id).
      IF cardinality(v_purchase_ids) > 0 THEN
        INSERT INTO public.tab_purchase_journal_links (enterprise_id, purchase_id, journal_entry_id, link_source, linked_by, linked_at)
        SELECT v_entry.enterprise_id, pid, v_repl_id, 'MANUAL_LINK', v_uid, now()
          FROM unnest(v_purchase_ids) AS pid;

        UPDATE public.tab_purchase_ledger
           SET journal_entry_id = v_repl_id,
               batch_reference  = v_repl_doc_number,
               bank_account_id  = v_entry.bank_account_id
         WHERE id = ANY (v_purchase_ids);
      END IF;
    ELSE
      -- Borrador: la misma partida pasa a ser el documento de reemplazo.
      v_repl_id := v_entry.id;
      v_repl_entry_number := v_entry.entry_number;

      UPDATE public.tab_journal_entries
         SET bank_reference = v_repl_doc_number,
             updated_by = v_uid,
             updated_at = now()
       WHERE id = v_entry.id;

      UPDATE public.tab_journal_entry_details
         SET bank_reference = v_repl_doc_number
       WHERE journal_entry_id = v_entry.id
         AND bank_reference = v_number;

      UPDATE public.tab_purchase_ledger
         SET batch_reference = v_repl_doc_number
       WHERE journal_entry_id = v_entry.id
         AND deleted_at IS NULL;
    END IF;
  END IF;

  -- ── 6. Bitácora ─────────────────────────────────────────────────────────────
  INSERT INTO public.tab_audit_log (enterprise_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    v_entry.enterprise_id, v_uid, 'VOID_BANK_DOCUMENT', 'tab_bank_documents', v_doc_id,
    jsonb_build_object(
      'entry_id', v_entry.id,
      'entry_number', v_entry.entry_number,
      'entry_status', v_entry.status,
      'document_number', v_number
    ),
    jsonb_build_object(
      'mode', CASE WHEN v_is_posted THEN 'posted' ELSE 'draft' END,
      'reason', v_reason,
      'void_date', p_void_date,
      'reversal_entry_id', v_rev_id,
      'reversal_entry_number', v_rev_number,
      'replacement_entry_id', v_repl_id,
      'replacement_entry_number', v_repl_entry_number,
      'replacement_document_number', v_repl_doc_number,
      'unlinked_purchase_ids', to_jsonb(v_purchase_ids),
      'relinked_to_replacement', (v_is_posted AND v_repl_id IS NOT NULL AND cardinality(v_purchase_ids) > 0),
      'warning', v_warning
    )
  );

  RETURN jsonb_build_object(
    'mode', CASE WHEN v_is_posted THEN 'posted' ELSE 'draft' END,
    'bank_document_id', v_doc_id,
    'document_number', v_number,
    'original_entry_id', v_entry.id,
    'original_entry_number', v_entry.entry_number,
    'reversal_entry_id', v_rev_id,
    'reversal_entry_number', v_rev_number,
    'replacement_entry_id', v_repl_id,
    'replacement_entry_number', v_repl_entry_number,
    'replacement_document_number', v_repl_doc_number,
    'unlinked_purchase_ids', to_jsonb(v_purchase_ids),
    'relinked_to_replacement', (v_is_posted AND v_repl_id IS NOT NULL AND cardinality(v_purchase_ids) > 0),
    'warning', v_warning
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. void_bank_document_number
--    Anula un número sin partida guardada (formulario sin guardar): solo el upsert
--    VOID. p_document_date es la fecha del documento; p_void_date (opcional) la
--    fecha real de anulación, por defecto hoy en Guatemala.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_bank_document_number(
  p_enterprise_id bigint,
  p_bank_gl_account_id bigint,
  p_document_number text,
  p_direction text,
  p_document_date date,
  p_reason text,
  p_beneficiary_name text DEFAULT NULL,
  p_concept text DEFAULT NULL,
  p_void_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_reason       text := btrim(COALESCE(p_reason, ''));
  v_number       text := NULLIF(btrim(p_document_number), '');
  v_direction    text := CASE WHEN upper(btrim(COALESCE(p_direction, ''))) = 'IN' THEN 'IN' ELSE 'OUT' END;
  v_doc_date     date := COALESCE(p_document_date, (now() AT TIME ZONE 'America/Guatemala')::date);
  v_void_date    date := COALESCE(p_void_date, (now() AT TIME ZONE 'America/Guatemala')::date);
  v_bank_acct_id bigint;
  v_warning      text;
  v_doc_id       bigint;
  v_dup_entry    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.is_super_admin(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises ue
       WHERE ue.user_id = v_uid AND ue.enterprise_id = p_enterprise_id AND ue.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role_permission(v_uid, p_enterprise_id, 'void_entries') THEN
    RAISE EXCEPTION 'No tiene permiso para anular documentos (permiso "Anular Partidas").' USING ERRCODE = '42501';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Debe indicar el motivo de la anulación (mínimo 3 caracteres).';
  END IF;
  IF p_bank_gl_account_id IS NULL OR v_number IS NULL THEN
    RAISE EXCEPTION 'Se requiere la cuenta bancaria y el número del documento a anular.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tab_accounts a
     WHERE a.id = p_bank_gl_account_id AND a.enterprise_id = p_enterprise_id
  ) THEN
    RAISE EXCEPTION 'La cuenta bancaria no pertenece a la empresa.';
  END IF;
  IF v_void_date < v_doc_date THEN
    RAISE EXCEPTION 'La fecha de anulación (%) no puede ser anterior a la fecha del documento (%).',
      to_char(v_void_date, 'DD/MM/YYYY'), to_char(v_doc_date, 'DD/MM/YYYY');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'bank_doc:' || p_enterprise_id || ':' || p_bank_gl_account_id || ':' || v_number, 0));

  -- Un número que ya pertenece a una partida se anula desde esa partida (para que
  -- se cree la reversión si corresponde).
  SELECT e.entry_number INTO v_dup_entry
    FROM public.tab_journal_entries e
   WHERE e.enterprise_id = p_enterprise_id
     AND e.bank_account_id = p_bank_gl_account_id
     AND e.bank_reference = v_number
     AND e.deleted_at IS NULL
     AND e.entry_number NOT LIKE 'REV-%'
   LIMIT 1;
  IF v_dup_entry IS NOT NULL THEN
    RAISE EXCEPTION 'El número % pertenece a la partida %; anúlelo desde esa partida.', v_number, v_dup_entry;
  END IF;

  SELECT ba.id INTO v_bank_acct_id
    FROM public.tab_bank_accounts ba
   WHERE ba.enterprise_id = p_enterprise_id AND ba.account_id = p_bank_gl_account_id
   ORDER BY ba.id
   LIMIT 1;
  IF v_bank_acct_id IS NULL THEN
    v_warning := 'La cuenta contable no tiene una cuenta registrada en Bancos: el documento anulado se guardó sin cuenta bancaria y no aparecerá en el Libro de Bancos de esa cuenta.';
  END IF;

  SELECT d.id INTO v_doc_id
    FROM public.tab_bank_documents d
   WHERE d.enterprise_id = p_enterprise_id
     AND d.bank_account_id IS NOT DISTINCT FROM v_bank_acct_id
     AND d.document_number = v_number
   FOR UPDATE;

  IF v_doc_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.tab_bank_documents WHERE id = v_doc_id AND status = 'VOID') THEN
      RAISE EXCEPTION 'El documento % ya está registrado como ANULADO.', v_number;
    END IF;
    UPDATE public.tab_bank_documents
       SET direction = v_direction,
           document_date = v_doc_date,
           beneficiary_name = p_beneficiary_name,
           concept = p_concept,
           status = 'VOID',
           void_date = v_void_date,
           void_reason = v_reason,
           journal_entry_id = NULL,
           reversal_journal_entry_id = NULL
     WHERE id = v_doc_id;
  ELSE
    INSERT INTO public.tab_bank_documents (
      enterprise_id, bank_account_id, document_number, direction, document_date,
      beneficiary_name, concept, status, void_date, void_reason, created_by
    ) VALUES (
      p_enterprise_id, v_bank_acct_id, v_number, v_direction, v_doc_date,
      p_beneficiary_name, p_concept, 'VOID', v_void_date, v_reason, v_uid
    )
    RETURNING id INTO v_doc_id;
  END IF;

  INSERT INTO public.tab_audit_log (enterprise_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    p_enterprise_id, v_uid, 'VOID_BANK_DOCUMENT', 'tab_bank_documents', v_doc_id,
    jsonb_build_object('document_number', v_number, 'bank_gl_account_id', p_bank_gl_account_id),
    jsonb_build_object(
      'mode', 'number_only',
      'reason', v_reason,
      'document_date', v_doc_date,
      'void_date', v_void_date,
      'warning', v_warning
    )
  );

  RETURN jsonb_build_object(
    'mode', 'number_only',
    'bank_document_id', v_doc_id,
    'document_number', v_number,
    'warning', v_warning
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. undo_void_bank_document
--    Solo mientras la REV siga en borrador: elimina la REV (líneas + cabecera),
--    limpia original.reversal_entry_id y borra el documento VOID (libera el número).
--    No re-vincula facturas: devuelve la lista para que el usuario las ligue de nuevo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.undo_void_bank_document(p_bank_document_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_doc       public.tab_bank_documents%ROWTYPE;
  v_rev       public.tab_journal_entries%ROWTYPE;
  v_orig_id   bigint;
  v_orig_number text;
  v_void_log  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc FROM public.tab_bank_documents WHERE id = p_bank_document_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento bancario no encontrado.';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises ue
       WHERE ue.user_id = v_uid AND ue.enterprise_id = v_doc.enterprise_id AND ue.deleted_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_role_permission(v_uid, v_doc.enterprise_id, 'void_entries') THEN
    RAISE EXCEPTION 'No tiene permiso para anular documentos (permiso "Anular Partidas").' USING ERRCODE = '42501';
  END IF;

  IF v_doc.status IS DISTINCT FROM 'VOID' THEN
    RAISE EXCEPTION 'El documento % no está anulado.', v_doc.document_number;
  END IF;
  IF v_doc.reversal_journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'La anulación del documento % no generó partida de reversión; no hay reversión que deshacer.', v_doc.document_number;
  END IF;

  SELECT * INTO v_rev FROM public.tab_journal_entries WHERE id = v_doc.reversal_journal_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la partida de reversión del documento %.', v_doc.document_number;
  END IF;
  IF COALESCE(v_rev.is_posted, false) OR COALESCE(v_rev.status, 'borrador') <> 'borrador' THEN
    RAISE EXCEPTION 'La reversión % ya no está en borrador (estado: %); la anulación no se puede deshacer.',
      v_rev.entry_number, COALESCE(v_rev.status, '—');
  END IF;

  v_orig_id := COALESCE(v_rev.reversed_by_entry_id, v_doc.journal_entry_id);
  SELECT entry_number INTO v_orig_number FROM public.tab_journal_entries WHERE id = v_orig_id;

  -- Facturas desvinculadas y reemplazo, según la última anulación registrada.
  SELECT a.new_values INTO v_void_log
    FROM public.tab_audit_log a
   WHERE a.action = 'VOID_BANK_DOCUMENT'
     AND a.table_name = 'tab_bank_documents'
     AND a.record_id = v_doc.id
   ORDER BY a.created_at DESC NULLS LAST, a.id DESC
   LIMIT 1;

  -- Orden por llaves foráneas: enlaces primero, luego documento, luego la REV.
  UPDATE public.tab_journal_entries
     SET reversal_entry_id = NULL,
         updated_by = v_uid,
         updated_at = now()
   WHERE id = v_orig_id
     AND reversal_entry_id = v_rev.id;

  DELETE FROM public.tab_bank_documents WHERE id = v_doc.id;
  DELETE FROM public.tab_journal_entry_details WHERE journal_entry_id = v_rev.id;
  DELETE FROM public.tab_journal_entries WHERE id = v_rev.id;

  INSERT INTO public.tab_audit_log (enterprise_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    v_doc.enterprise_id, v_uid, 'UNDO_VOID_BANK_DOCUMENT', 'tab_bank_documents', v_doc.id,
    jsonb_build_object(
      'document_number', v_doc.document_number,
      'void_date', v_doc.void_date,
      'void_reason', v_doc.void_reason,
      'reversal_entry_id', v_rev.id,
      'reversal_entry_number', v_rev.entry_number,
      'original_entry_id', v_orig_id,
      'original_entry_number', v_orig_number
    ),
    jsonb_build_object(
      'unlinked_purchase_ids', COALESCE(v_void_log -> 'unlinked_purchase_ids', '[]'::jsonb),
      'replacement_entry_id', v_void_log -> 'replacement_entry_id'
    )
  );

  RETURN jsonb_build_object(
    'document_number', v_doc.document_number,
    'original_entry_id', v_orig_id,
    'original_entry_number', v_orig_number,
    'deleted_reversal_entry_number', v_rev.entry_number,
    'unlinked_purchase_ids', COALESCE(v_void_log -> 'unlinked_purchase_ids', '[]'::jsonb),
    'replacement_entry_id', v_void_log -> 'replacement_entry_id',
    'replacement_entry_number', v_void_log -> 'replacement_entry_number'
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. delete_draft_journal_entry
--    Misma lógica que la versión vigente (20260611212404) más:
--    * Rechaza borrar la REV de un documento bancario anulado ("Deshacer anulación").
--    * Limpia original.reversal_entry_id cuando el borrador es la REV de una
--      reversión normal (las FK no tienen ON DELETE, antes fallaba o quedaba colgado).
--    * Deja en NULL tab_bank_documents.journal_entry_id que apunte al borrador
--      (anulaciones antiguas de borradores), para que el DELETE no falle por la FK.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_draft_journal_entry(p_entry_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry tab_journal_entries%ROWTYPE;
  v_user uuid := auth.uid();
  v_has_access boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  SELECT * INTO v_entry FROM tab_journal_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida no encontrada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE user_id = v_user AND enterprise_id = v_entry.enterprise_id AND deleted_at IS NULL
  ) INTO v_has_access;
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Sin acceso a la empresa';
  END IF;

  IF COALESCE(v_entry.status, 'borrador') <> 'borrador' THEN
    RAISE EXCEPTION 'Solo se pueden eliminar partidas en estado Borrador';
  END IF;

  IF EXISTS (SELECT 1 FROM tab_bank_documents WHERE reversal_journal_entry_id = p_entry_id) THEN
    RAISE EXCEPTION 'Esta partida es la reversión de un documento bancario anulado. Use "Deshacer anulación" en lugar de eliminarla.';
  END IF;

  -- Audit log first (we still have the data)
  INSERT INTO tab_audit_log (enterprise_id, user_id, action, table_name, record_id, old_values)
  VALUES (
    v_entry.enterprise_id,
    v_user,
    'DELETE_DRAFT_ENTRY',
    'tab_journal_entries',
    v_entry.id,
    jsonb_build_object(
      'entry_number', v_entry.entry_number,
      'entry_date',   v_entry.entry_date,
      'description',  v_entry.description,
      'total_debit',  v_entry.total_debit,
      'total_credit', v_entry.total_credit
    )
  );

  -- Reversión normal en borrador: la original deja de apuntar a ella.
  UPDATE tab_journal_entries
     SET reversal_entry_id = NULL,
         updated_by = v_user,
         updated_at = now()
   WHERE reversal_entry_id = p_entry_id;

  -- Documentos bancarios que apuntan al borrador (anulaciones antiguas).
  UPDATE tab_bank_documents
     SET journal_entry_id = NULL
   WHERE journal_entry_id = p_entry_id;

  -- Hard delete details (FK cascades on tab_journal_entry_history too)
  DELETE FROM tab_journal_entry_details WHERE journal_entry_id = p_entry_id;
  DELETE FROM tab_journal_entries WHERE id = p_entry_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Auditoría de tab_bank_documents
--    audit_trigger_function es genérica: toma enterprise_id / id de la fila (con
--    manejo de undefined_column) y TG_TABLE_NAME, y respeta app.import_mode, así
--    que los reseteos administrativos no generan bitácora. tab_bank_documents solo
--    contiene documentos VOID: volumen bajo.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS audit_bank_documents ON public.tab_bank_documents;
CREATE TRIGGER audit_bank_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.tab_bank_documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos (firma exacta de cada función)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.next_bank_document_number(bigint, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_bank_document_number(bigint, bigint, text) TO authenticated;

REVOKE ALL ON FUNCTION public.void_bank_document(bigint, date, text, boolean, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_bank_document(bigint, date, text, boolean, date, text) TO authenticated;

REVOKE ALL ON FUNCTION public.void_bank_document_number(bigint, bigint, text, text, date, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_bank_document_number(bigint, bigint, text, text, date, text, text, text, date) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_void_bank_document(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_void_bank_document(bigint) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_draft_journal_entry(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_draft_journal_entry(bigint) TO authenticated;

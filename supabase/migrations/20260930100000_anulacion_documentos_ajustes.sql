-- Ajustes a la anulación de documentos bancarios (sobre 20260929220000)
--
-- CREATE OR REPLACE de tres funciones; firmas y permisos sin cambios.
--   1. undo_void_bank_document: la búsqueda del último VOID_BANK_DOCUMENT en
--      tab_audit_log filtra por enterprise_id y created_at >= creación del documento
--      (usa idx_audit_enterprise / idx_audit_date en lugar de un Seq Scan de 114 MB).
--   2. next_bank_document_number: la serie se elige por frecuencia de
--      (prefijo, cantidad de dígitos) entre los últimos 200 registros parseables, no
--      por el registro más reciente; devuelve el máximo de esa serie + 1 (y, si ese
--      número ya existe en la cuenta, el siguiente libre).
--   3. delete_draft_journal_entry: antes del DELETE final libera las facturas
--      vinculadas al borrador (FK tab_purchase_ledger_journal_entry_id_fkey).
--
-- Se aplica manualmente vía MCP y se registra en supabase_migrations.schema_migrations.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. undo_void_bank_document (solo cambia el WHERE de la consulta a tab_audit_log)
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
   WHERE a.enterprise_id = v_doc.enterprise_id
     AND a.created_at >= v_doc.created_at
     AND a.action = 'VOID_BANK_DOCUMENT'
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
-- 2. next_bank_document_number (cambia la selección de la serie y evita sugerir un número ya usado)
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
  v_candidate    text;
  v_guard        integer := 0;
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

  -- Últimos 200 registros de cada fuente, con su fecha para desempatar.
  WITH je AS (
    SELECT btrim(e.bank_reference) AS ref, e.entry_date AS rec_date, e.created_at AS rec_created
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
    SELECT btrim(d.document_number) AS ref, d.document_date AS rec_date, d.created_at AS rec_created
      FROM public.tab_bank_documents d
     WHERE v_bank_acct_id IS NOT NULL
       AND d.enterprise_id = p_enterprise_id
       AND d.bank_account_id = v_bank_acct_id
       AND d.direction = v_dir
     ORDER BY d.document_date DESC, d.created_at DESC, d.id DESC
     LIMIT 200
  ),
  refs AS (
    SELECT u.ref, u.rec_date, u.rec_created, substring(u.ref FROM '(\d+)$') AS digits
      FROM (SELECT * FROM je UNION ALL SELECT * FROM bd) u
  ),
  parsed AS (
    SELECT left(ref, length(ref) - length(digits)) AS prefix,
           length(digits) AS width,
           digits::numeric AS seq,
           rec_date, rec_created
      FROM refs
     WHERE digits IS NOT NULL
  ),
  -- Serie = (prefijo, cantidad de dígitos). Gana la más frecuente; en empate, la que
  -- tenga el registro más reciente. Así una transferencia con número largo no
  -- arrastra la serie de cheques.
  series AS (
    SELECT prefix, width,
           count(*) AS n,
           max(seq) AS max_seq,
           max(rec_date) AS last_date,
           max(rec_created) AS last_created
      FROM parsed
     GROUP BY prefix, width
  )
  SELECT s.prefix, s.max_seq, s.width
    INTO v_prefix, v_max, v_width
    FROM series s
   ORDER BY s.n DESC, s.last_date DESC NULLS LAST, s.last_created DESC NULLS LAST
   LIMIT 1;

  IF v_max IS NULL THEN
    RETURN NULL;
  END IF;

  -- Máximo de la serie + 1. Si ese número ya está usado en la cuenta (p. ej. la
  -- serie cruzó de 999 a 1000 y el grupo de 3 dígitos sigue siendo el más
  -- frecuente), se avanza al siguiente libre para no sugerir un duplicado.
  LOOP
    v_max := v_max + 1;
    v_next := v_max::text;
    v_candidate := v_prefix || lpad(v_next, GREATEST(v_width, length(v_next)), '0');
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 1000;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.tab_journal_entries e
       WHERE e.enterprise_id = p_enterprise_id
         AND e.bank_account_id = p_bank_gl_account_id
         AND e.bank_reference = v_candidate
         AND e.deleted_at IS NULL
         AND e.entry_number NOT LIKE 'REV-%'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.tab_bank_documents d
       WHERE v_bank_acct_id IS NOT NULL
         AND d.enterprise_id = p_enterprise_id
         AND d.bank_account_id = v_bank_acct_id
         AND d.document_number = v_candidate
    );
  END LOOP;

  RETURN v_candidate;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. delete_draft_journal_entry (se agrega la liberación de facturas)
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

  -- Facturas vinculadas al borrador: sin esto el DELETE falla por la FK
  -- tab_purchase_ledger_journal_entry_id_fkey. Primero el libro (mientras los
  -- vínculos aún apuntan al borrador), luego los vínculos.
  UPDATE tab_purchase_ledger
     SET journal_entry_id = NULL,
         batch_reference  = NULL,
         bank_account_id  = NULL
   WHERE journal_entry_id = p_entry_id;

  DELETE FROM tab_purchase_journal_links WHERE journal_entry_id = p_entry_id;

  -- Hard delete details (FK cascades on tab_journal_entry_history too)
  DELETE FROM tab_journal_entry_details WHERE journal_entry_id = p_entry_id;
  DELETE FROM tab_journal_entries WHERE id = p_entry_id;
END;
$$;

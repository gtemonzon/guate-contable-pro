-- 1) New company-level toggle
ALTER TABLE public.tab_enterprise_config
  ADD COLUMN IF NOT EXISTS allow_reopen_posted_entries boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tab_enterprise_config.allow_reopen_posted_entries IS
  'When true, users with permission can reopen MANUALLY posted journal entries back to draft for editing.';

-- 2) RPC: delete a draft journal entry (and its details)
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

  SELECT * INTO v_entry FROM tab_journal_entries WHERE id = p_entry_id;
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

  -- Hard delete details (FK cascades on tab_journal_entry_history too)
  DELETE FROM tab_journal_entry_details WHERE journal_entry_id = p_entry_id;
  DELETE FROM tab_journal_entries WHERE id = p_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_draft_journal_entry(bigint) TO authenticated;

-- 3) RPC: reopen a manually posted entry back to draft
CREATE OR REPLACE FUNCTION public.reopen_journal_entry(p_entry_id bigint, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry tab_journal_entries%ROWTYPE;
  v_user uuid := auth.uid();
  v_has_access boolean;
  v_allowed boolean;
  v_period_status text;
  v_prefix text;
  v_old_header jsonb;
  v_new_header jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Debe indicar el motivo de la reapertura';
  END IF;

  SELECT * INTO v_entry FROM tab_journal_entries WHERE id = p_entry_id;
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

  IF v_entry.status <> 'contabilizado' THEN
    RAISE EXCEPTION 'Solo se pueden reabrir partidas contabilizadas';
  END IF;

  -- Company-level toggle
  SELECT COALESCE(allow_reopen_posted_entries, false) INTO v_allowed
  FROM tab_enterprise_config WHERE enterprise_id = v_entry.enterprise_id;
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'La reapertura de partidas no está habilitada en la configuración de la empresa';
  END IF;

  -- Manual-only: by entry_number prefix (PART = Manual, AJUS = Manual adjustment)
  v_prefix := split_part(v_entry.entry_number, '-', 1);
  IF v_prefix NOT IN ('PART', 'AJUS') THEN
    RAISE EXCEPTION 'Esta partida fue generada automáticamente. Modifique el documento de origen.';
  END IF;

  -- Block opening / closing entry types
  IF v_entry.entry_type IN ('apertura', 'cierre') THEN
    RAISE EXCEPTION 'No se pueden reabrir partidas de apertura o cierre';
  END IF;

  -- Block reversals
  IF v_entry.reversed_by_entry_id IS NOT NULL OR v_entry.reversal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se pueden reabrir partidas vinculadas a reversiones';
  END IF;

  -- Block when fiscal period is closed
  IF v_entry.accounting_period_id IS NOT NULL THEN
    SELECT status INTO v_period_status FROM tab_accounting_periods WHERE id = v_entry.accounting_period_id;
    IF v_period_status IS DISTINCT FROM 'abierto' THEN
      RAISE EXCEPTION 'El período contable está cerrado';
    END IF;
  END IF;

  v_old_header := jsonb_build_object('status', v_entry.status, 'is_posted', v_entry.is_posted, 'posted_at', v_entry.posted_at);

  UPDATE tab_journal_entries
     SET status = 'borrador',
         is_posted = false,
         posted_at = NULL,
         updated_by = v_user,
         updated_at = now()
   WHERE id = p_entry_id;

  v_new_header := jsonb_build_object('status', 'borrador', 'is_posted', false, 'posted_at', NULL);

  -- History
  INSERT INTO tab_journal_entry_history
    (journal_entry_id, enterprise_id, changed_by, change_type, old_header, new_header, change_summary)
  VALUES
    (p_entry_id, v_entry.enterprise_id, v_user, 'REOPEN', v_old_header, v_new_header,
     'Reapertura para edición. Motivo: ' || p_reason);

  -- Audit
  INSERT INTO tab_audit_log (enterprise_id, user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    v_entry.enterprise_id, v_user, 'REOPEN_ENTRY', 'tab_journal_entries', p_entry_id,
    jsonb_build_object('entry_number', v_entry.entry_number, 'status', v_entry.status, 'reason', p_reason),
    jsonb_build_object('status', 'borrador')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_journal_entry(bigint, text) TO authenticated;
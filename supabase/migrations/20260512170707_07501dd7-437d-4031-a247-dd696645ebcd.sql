CREATE OR REPLACE FUNCTION public.update_posted_entry_metadata(
  p_journal_entry_id bigint,
  p_description text DEFAULT NULL::text,
  p_beneficiary_name text DEFAULT NULL::text,
  p_bank_reference text DEFAULT NULL::text,
  p_document_reference text DEFAULT NULL::text,
  p_reason text DEFAULT 'Corrección administrativa'::text,
  p_entry_type text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_entry RECORD;
  v_before JSONB;
  v_after JSONB;
  v_user_id UUID;
  v_enterprise_id BIGINT;
  v_user_role TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = 'P0030';
  END IF;

  SELECT * INTO v_entry
  FROM public.tab_journal_entries
  WHERE id = p_journal_entry_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida no encontrada' USING ERRCODE = 'P0031';
  END IF;

  IF v_entry.status != 'contabilizado' OR v_entry.is_posted != true THEN
    RAISE EXCEPTION 'Esta función solo aplica a partidas contabilizadas' USING ERRCODE = 'P0032';
  END IF;

  v_enterprise_id := v_entry.enterprise_id;

  IF NOT (public.is_super_admin(v_user_id) OR public.user_is_linked_to_enterprise(v_user_id, v_enterprise_id)) THEN
    RAISE EXCEPTION 'Sin acceso a esta empresa' USING ERRCODE = 'P0033';
  END IF;

  SELECT role INTO v_user_role
  FROM public.tab_user_enterprises
  WHERE user_id = v_user_id AND enterprise_id = v_enterprise_id;

  IF NOT (public.is_super_admin(v_user_id) OR v_user_role IN ('enterprise_admin', 'contador_senior')) THEN
    RAISE EXCEPTION 'Solo administradores y contadores senior pueden editar metadatos de partidas contabilizadas' USING ERRCODE = 'P0034';
  END IF;

  IF v_entry.accounting_period_id IS NOT NULL THEN
    DECLARE v_period_status TEXT;
    BEGIN
      SELECT status INTO v_period_status FROM public.tab_accounting_periods WHERE id = v_entry.accounting_period_id;
      IF v_period_status IS DISTINCT FROM 'abierto' THEN
        RAISE EXCEPTION 'No se puede editar: el período contable está cerrado' USING ERRCODE = 'P0035';
      END IF;
    END;
  END IF;

  IF p_entry_type IS NOT NULL AND p_entry_type NOT IN ('apertura','diario','ajuste','cierre') THEN
    RAISE EXCEPTION 'Tipo de partida inválido: %', p_entry_type USING ERRCODE = 'P0036';
  END IF;

  v_before := jsonb_build_object(
    'description', v_entry.description,
    'beneficiary_name', v_entry.beneficiary_name,
    'bank_reference', v_entry.bank_reference,
    'document_reference', v_entry.document_reference,
    'entry_type', v_entry.entry_type
  );

  PERFORM set_config('app.allow_posted_metadata_update', 'true', true);

  UPDATE public.tab_journal_entries SET
    description = COALESCE(p_description, description),
    beneficiary_name = COALESCE(p_beneficiary_name, beneficiary_name),
    bank_reference = COALESCE(p_bank_reference, bank_reference),
    document_reference = COALESCE(p_document_reference, document_reference),
    entry_type = COALESCE(p_entry_type, entry_type),
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_journal_entry_id;

  v_after := jsonb_build_object(
    'description', COALESCE(p_description, v_entry.description),
    'beneficiary_name', COALESCE(p_beneficiary_name, v_entry.beneficiary_name),
    'bank_reference', COALESCE(p_bank_reference, v_entry.bank_reference),
    'document_reference', COALESCE(p_document_reference, v_entry.document_reference),
    'entry_type', COALESCE(p_entry_type, v_entry.entry_type)
  );

  INSERT INTO public.tab_journal_entry_metadata_changes (
    enterprise_id, journal_entry_id, changed_by, reason, before_json, after_json
  ) VALUES (
    v_enterprise_id, p_journal_entry_id, v_user_id, p_reason, v_before, v_after
  );

  RETURN jsonb_build_object('success', true, 'before', v_before, 'after', v_after);
END;
$function$;
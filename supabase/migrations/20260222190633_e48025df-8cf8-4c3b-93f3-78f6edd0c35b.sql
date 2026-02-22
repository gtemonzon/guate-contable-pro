
-- Step 1: Update the RPC to set a transaction-local flag before the UPDATE
CREATE OR REPLACE FUNCTION public.update_posted_entry_metadata(
  p_journal_entry_id bigint,
  p_description text DEFAULT NULL,
  p_beneficiary_name text DEFAULT NULL,
  p_bank_reference text DEFAULT NULL,
  p_document_reference text DEFAULT NULL,
  p_reason text DEFAULT 'Corrección administrativa'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
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

  v_before := jsonb_build_object(
    'description', v_entry.description,
    'beneficiary_name', v_entry.beneficiary_name,
    'bank_reference', v_entry.bank_reference,
    'document_reference', v_entry.document_reference
  );

  -- Set transaction-local flag so the immutability trigger allows this update
  PERFORM set_config('app.allow_posted_metadata_update', 'true', true);

  UPDATE public.tab_journal_entries SET
    description = COALESCE(p_description, description),
    beneficiary_name = COALESCE(p_beneficiary_name, beneficiary_name),
    bank_reference = COALESCE(p_bank_reference, bank_reference),
    document_reference = COALESCE(p_document_reference, document_reference),
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_journal_entry_id;

  v_after := jsonb_build_object(
    'description', COALESCE(p_description, v_entry.description),
    'beneficiary_name', COALESCE(p_beneficiary_name, v_entry.beneficiary_name),
    'bank_reference', COALESCE(p_bank_reference, v_entry.bank_reference),
    'document_reference', COALESCE(p_document_reference, v_entry.document_reference)
  );

  INSERT INTO public.tab_journal_entry_metadata_changes (
    enterprise_id, journal_entry_id, changed_by, reason, before_json, after_json
  ) VALUES (
    v_enterprise_id, p_journal_entry_id, v_user_id, p_reason, v_before, v_after
  );

  RETURN jsonb_build_object('success', true, 'before', v_before, 'after', v_after);
END;
$$;

-- Step 2: Update the immutability trigger to respect the bypass flag for metadata-only changes
CREATE OR REPLACE FUNCTION public.enforce_journal_entry_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.is_posted = true AND OLD.status = 'contabilizado' THEN
    -- Allow soft-delete (void/reversal workflow)
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RETURN NEW;
    END IF;

    -- Allow metadata-only updates via the controlled RPC
    IF current_setting('app.allow_posted_metadata_update', true) = 'true' THEN
      -- Verify ONLY metadata columns changed; block any financial/structural change
      IF (
        OLD.entry_number         = NEW.entry_number AND
        OLD.entry_date           = NEW.entry_date AND
        OLD.entry_type           = NEW.entry_type AND
        OLD.accounting_period_id IS NOT DISTINCT FROM NEW.accounting_period_id AND
        OLD.total_debit          = NEW.total_debit AND
        OLD.total_credit         = NEW.total_credit AND
        OLD.enterprise_id        = NEW.enterprise_id AND
        OLD.is_posted            = NEW.is_posted AND
        OLD.status               = NEW.status
      ) THEN
        RETURN NEW; -- Only metadata fields changed, allow it
      END IF;
      -- If financial columns also changed, still block
      RAISE EXCEPTION 'El bypass de metadatos no permite cambiar datos contables.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Allow updates where ONLY audit/system fields changed (no business data)
    IF (
      OLD.entry_number        = NEW.entry_number AND
      OLD.entry_date          = NEW.entry_date   AND
      OLD.entry_type          = NEW.entry_type   AND
      OLD.accounting_period_id IS NOT DISTINCT FROM NEW.accounting_period_id AND
      OLD.description         = NEW.description  AND
      OLD.total_debit         = NEW.total_debit  AND
      OLD.total_credit        = NEW.total_credit AND
      OLD.enterprise_id       = NEW.enterprise_id
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Las partidas contabilizadas son inmutables. Use una partida de reversión (REV-) para corregir.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

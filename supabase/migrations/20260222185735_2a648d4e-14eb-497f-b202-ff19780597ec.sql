
-- 1) Create audit table for metadata changes on posted entries
CREATE TABLE public.tab_journal_entry_metadata_changes (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  journal_entry_id BIGINT NOT NULL REFERENCES public.tab_journal_entries(id),
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  before_json JSONB NOT NULL,
  after_json JSONB NOT NULL
);

ALTER TABLE public.tab_journal_entry_metadata_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view metadata changes for their enterprises"
  ON public.tab_journal_entry_metadata_changes FOR SELECT
  USING (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Users can insert metadata changes for their enterprises"
  ON public.tab_journal_entry_metadata_changes FOR INSERT
  WITH CHECK (public.user_is_linked_to_enterprise(auth.uid(), enterprise_id) OR public.is_super_admin(auth.uid()));

CREATE INDEX idx_je_metadata_changes_entry ON public.tab_journal_entry_metadata_changes(journal_entry_id);

-- 2) Create RPC function to safely update metadata on posted entries
CREATE OR REPLACE FUNCTION public.update_posted_entry_metadata(
  p_journal_entry_id BIGINT,
  p_description TEXT DEFAULT NULL,
  p_beneficiary_name TEXT DEFAULT NULL,
  p_bank_reference TEXT DEFAULT NULL,
  p_document_reference TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT 'Corrección administrativa'
)
RETURNS JSONB
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

  -- Get current entry
  SELECT * INTO v_entry
  FROM public.tab_journal_entries
  WHERE id = p_journal_entry_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida no encontrada' USING ERRCODE = 'P0031';
  END IF;

  -- Must be posted
  IF v_entry.status != 'contabilizado' OR v_entry.is_posted != true THEN
    RAISE EXCEPTION 'Esta función solo aplica a partidas contabilizadas' USING ERRCODE = 'P0032';
  END IF;

  v_enterprise_id := v_entry.enterprise_id;

  -- Check user has access and appropriate role
  IF NOT (public.is_super_admin(v_user_id) OR public.user_is_linked_to_enterprise(v_user_id, v_enterprise_id)) THEN
    RAISE EXCEPTION 'Sin acceso a esta empresa' USING ERRCODE = 'P0033';
  END IF;

  -- Check permission: only admin/contador_senior/super_admin
  SELECT role INTO v_user_role
  FROM public.tab_user_enterprises
  WHERE user_id = v_user_id AND enterprise_id = v_enterprise_id;

  IF NOT (public.is_super_admin(v_user_id) OR v_user_role IN ('enterprise_admin', 'contador_senior')) THEN
    RAISE EXCEPTION 'Solo administradores y contadores senior pueden editar metadatos de partidas contabilizadas' USING ERRCODE = 'P0034';
  END IF;

  -- Check period is open
  IF v_entry.accounting_period_id IS NOT NULL THEN
    DECLARE v_period_status TEXT;
    BEGIN
      SELECT status INTO v_period_status FROM public.tab_accounting_periods WHERE id = v_entry.accounting_period_id;
      IF v_period_status IS DISTINCT FROM 'abierto' THEN
        RAISE EXCEPTION 'No se puede editar: el período contable está cerrado' USING ERRCODE = 'P0035';
      END IF;
    END;
  END IF;

  -- Build before snapshot (only metadata fields)
  v_before := jsonb_build_object(
    'description', v_entry.description,
    'beneficiary_name', v_entry.beneficiary_name,
    'bank_reference', v_entry.bank_reference,
    'document_reference', v_entry.document_reference
  );

  -- Apply changes (only non-null params override)
  UPDATE public.tab_journal_entries SET
    description = COALESCE(p_description, description),
    beneficiary_name = COALESCE(p_beneficiary_name, beneficiary_name),
    bank_reference = COALESCE(p_bank_reference, bank_reference),
    document_reference = COALESCE(p_document_reference, document_reference),
    updated_by = v_user_id,
    updated_at = now()
  WHERE id = p_journal_entry_id;

  -- Build after snapshot
  v_after := jsonb_build_object(
    'description', COALESCE(p_description, v_entry.description),
    'beneficiary_name', COALESCE(p_beneficiary_name, v_entry.beneficiary_name),
    'bank_reference', COALESCE(p_bank_reference, v_entry.bank_reference),
    'document_reference', COALESCE(p_document_reference, v_entry.document_reference)
  );

  -- Log the change
  INSERT INTO public.tab_journal_entry_metadata_changes (
    enterprise_id, journal_entry_id, changed_by, reason, before_json, after_json
  ) VALUES (
    v_enterprise_id, p_journal_entry_id, v_user_id, p_reason, v_before, v_after
  );

  RETURN jsonb_build_object('success', true, 'before', v_before, 'after', v_after);
END;
$$;

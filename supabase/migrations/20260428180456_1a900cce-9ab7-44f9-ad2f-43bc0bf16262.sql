CREATE OR REPLACE FUNCTION public.reset_legacy_import_data(p_enterprise_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user uuid := auth.uid();
  v_deleted jsonb;
BEGIN
  IF v_auth_user IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF NOT (
    public.is_super_admin(v_auth_user)
    OR public.user_is_linked_to_enterprise(v_auth_user, p_enterprise_id)
  ) THEN
    RAISE EXCEPTION 'Sin permisos para limpiar esta empresa';
  END IF;

  DELETE FROM public.fixed_asset_depreciation_schedule
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.fixed_asset_event_log
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.fixed_assets
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.fixed_asset_categories
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_purchase_journal_links
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_purchase_books
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_purchase_ledger
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_sales_ledger
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_journal_entry_history
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_journal_entry_details
  WHERE journal_entry_id IN (
    SELECT id FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id
  );

  DELETE FROM public.tab_journal_entries
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_accounting_periods
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_accounts
  WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.tab_legacy_import_jobs
  WHERE enterprise_id = p_enterprise_id;

  v_deleted := jsonb_build_object(
    'enterprise_id', p_enterprise_id,
    'cleared_at', now()
  );

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_legacy_import_data(bigint) TO authenticated;
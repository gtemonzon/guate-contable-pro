
CREATE OR REPLACE FUNCTION public.hard_reset_enterprise(p_enterprise_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stats jsonb := '[]'::jsonb;
  v_start timestamptz;
  v_t0    timestamptz;
  v_deleted bigint;
  v_remaining bigint;
  v_tbl text;
  v_sql text;
  v_lock_key bigint;
  v_uid uuid := auth.uid();
  v_tables text[] := ARRAY[
    'tab_purchase_journal_links',
    'tab_journal_entry_history',
    'tab_journal_entry_metadata_changes',
    'tab_purchase_ledger',
    'tab_sales_ledger',
    'tab_purchase_books',
    'tab_period_inventory_closing',
    'tab_bank_movements',
    'tab_bank_documents',
    'tab_bank_reconciliations',
    'tab_bank_import_templates',
    'tab_bank_accounts',
    'fixed_asset_depreciation_schedule',
    'fixed_asset_event_log',
    'fixed_assets',
    'fixed_asset_categories',
    'fixed_asset_locations',
    'fixed_asset_custodians',
    'fixed_asset_suppliers',
    'fixed_asset_policy',
    'tab_fx_settlements',
    'tab_fx_open_balances',
    'tab_fx_revaluation_runs',
    'tab_journal_entry_details',
    'tab_journal_entries',
    'tab_integrity_validations',
    'tab_accounting_periods',
    'tab_book_folio_consumption',
    'tab_book_authorizations',
    'tab_integrity_rules_config',
    'tab_holidays',
    'tab_tax_due_date_config',
    'tab_alert_config',
    'tab_custom_reminders',
    'tab_notifications',
    'tab_role_permissions',
    'tab_dashboard_card_config',
    'tab_backup_history',
    'tab_operation_types',
    'tab_tax_forms',
    'tab_audit_log',
    'tab_import_logs',
    'tab_exchange_rates',
    'tab_accounts'
  ];
BEGIN
  -- Authorization: allow when called from service role (no auth.uid()) OR by authorized user
  IF v_uid IS NOT NULL AND NOT (
    public.is_super_admin(v_uid)
    OR public.user_is_linked_to_enterprise(v_uid, p_enterprise_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied for enterprise %', p_enterprise_id USING ERRCODE = '42501';
  END IF;

  v_lock_key := 7777777000000 + p_enterprise_id;
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RAISE EXCEPTION 'Another reset is already in progress for enterprise %', p_enterprise_id USING ERRCODE = '55P03';
  END IF;

  PERFORM set_config('app.import_mode', 'on', true);
  PERFORM set_config('app.allow_posted_metadata_update', 'true', true);

  v_start := clock_timestamp();

  UPDATE public.tab_enterprise_config
     SET retained_earnings_account_id = NULL,
         inventory_account_id = NULL,
         cost_of_sales_account_id = NULL
   WHERE enterprise_id = p_enterprise_id;

  UPDATE public.tab_journal_entries
     SET reversal_entry_id = NULL,
         reversed_by_entry_id = NULL,
         bank_account_id = NULL,
         accounting_period_id = NULL
   WHERE enterprise_id = p_enterprise_id;

  UPDATE public.tab_accounts
     SET parent_account_id = NULL
   WHERE enterprise_id = p_enterprise_id;

  UPDATE public.fixed_assets
     SET disposal_je_id = NULL
   WHERE enterprise_id = p_enterprise_id;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    v_t0 := clock_timestamp();

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_tbl
    ) THEN
      v_stats := v_stats || jsonb_build_object('table', v_tbl, 'skipped', true);
      CONTINUE;
    END IF;

    v_sql := format('DELETE FROM public.%I WHERE enterprise_id = $1', v_tbl);
    EXECUTE v_sql USING p_enterprise_id;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE enterprise_id = $1', v_tbl)
      INTO v_remaining USING p_enterprise_id;

    v_stats := v_stats || jsonb_build_object(
      'table', v_tbl,
      'deleted', v_deleted,
      'remaining', v_remaining,
      'ms', round(EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000)
    );

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Hard reset failed: table % still has % rows after delete', v_tbl, v_remaining
        USING ERRCODE = 'P0099';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'enterprise_id', p_enterprise_id,
    'total_ms', round(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000),
    'phases', v_stats
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.hard_reset_enterprise(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_reset_enterprise(bigint) TO authenticated, service_role;

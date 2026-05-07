CREATE OR REPLACE FUNCTION public.clear_legacy_import_batch(p_enterprise_id bigint, p_phase text, p_batch_size integer DEFAULT 500)
 RETURNS TABLE(phase_key text, table_name text, deleted_count bigint, remaining_count bigint, done boolean, execution_ms integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_deleted bigint := 0;
  v_remaining bigint := 0;
  v_batch_size integer := GREATEST(1, LEAST(COALESCE(p_batch_size, 500), 2000));
BEGIN
  PERFORM set_config('app.import_mode', 'on', true);
  PERFORM set_config('app.allow_posted_metadata_update', 'true', true);

  IF p_phase IS NULL OR btrim(p_phase) = '' THEN
    RAISE EXCEPTION 'Fase requerida';
  END IF;

  CASE p_phase
    WHEN 'enterprise_config_detach_accounts' THEN
      UPDATE public.tab_enterprise_config
         SET retained_earnings_account_id = NULL,
             inventory_account_id = NULL,
             cost_of_sales_account_id = NULL
       WHERE enterprise_id = p_enterprise_id
         AND (
           retained_earnings_account_id IS NOT NULL OR
           inventory_account_id IS NOT NULL OR
           cost_of_sales_account_id IS NOT NULL
         );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_remaining := 0;

    WHEN 'journal_entries_detach_self_refs' THEN
      WITH target AS (
        SELECT id
        FROM public.tab_journal_entries
        WHERE enterprise_id = p_enterprise_id
          AND (reversal_entry_id IS NOT NULL OR reversed_by_entry_id IS NOT NULL)
        ORDER BY id
        LIMIT v_batch_size
      )
      UPDATE public.tab_journal_entries je
         SET reversal_entry_id = NULL,
             reversed_by_entry_id = NULL
        FROM target
       WHERE je.id = target.id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      SELECT COUNT(*) INTO v_remaining
      FROM public.tab_journal_entries
      WHERE enterprise_id = p_enterprise_id
        AND (reversal_entry_id IS NOT NULL OR reversed_by_entry_id IS NOT NULL);

    -- Bank reconciliations: ownership via bank_account_id -> tab_bank_accounts.enterprise_id
    WHEN 'tab_bank_reconciliations' THEN
      DELETE FROM public.tab_bank_reconciliations br
      WHERE br.id IN (
        SELECT br2.id
        FROM public.tab_bank_reconciliations br2
        JOIN public.tab_bank_accounts ba ON ba.id = br2.bank_account_id
        WHERE ba.enterprise_id = p_enterprise_id
        ORDER BY br2.id
        LIMIT v_batch_size
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      SELECT COUNT(*) INTO v_remaining
      FROM public.tab_bank_reconciliations br
      JOIN public.tab_bank_accounts ba ON ba.id = br.bank_account_id
      WHERE ba.enterprise_id = p_enterprise_id;

    -- Journal entry details: ownership via journal_entry_id -> tab_journal_entries.enterprise_id
    WHEN 'tab_journal_entry_details' THEN
      DELETE FROM public.tab_journal_entry_details d
      WHERE d.id IN (
        SELECT d2.id
        FROM public.tab_journal_entry_details d2
        JOIN public.tab_journal_entries je ON je.id = d2.journal_entry_id
        WHERE je.enterprise_id = p_enterprise_id
        ORDER BY d2.id
        LIMIT v_batch_size
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      SELECT COUNT(*) INTO v_remaining
      FROM public.tab_journal_entry_details d
      JOIN public.tab_journal_entries je ON je.id = d.journal_entry_id
      WHERE je.enterprise_id = p_enterprise_id;

    -- Generic enterprise_id-owned tables
    WHEN 'tab_purchase_journal_links' THEN
      DELETE FROM public.tab_purchase_journal_links WHERE id IN (SELECT id FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_journal_entry_history' THEN
      DELETE FROM public.tab_journal_entry_history WHERE id IN (SELECT id FROM public.tab_journal_entry_history WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_journal_entry_history WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_journal_entry_metadata_changes' THEN
      DELETE FROM public.tab_journal_entry_metadata_changes WHERE id IN (SELECT id FROM public.tab_journal_entry_metadata_changes WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_journal_entry_metadata_changes WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_purchase_ledger' THEN
      DELETE FROM public.tab_purchase_ledger WHERE id IN (SELECT id FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_sales_ledger' THEN
      DELETE FROM public.tab_sales_ledger WHERE id IN (SELECT id FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_purchase_books' THEN
      DELETE FROM public.tab_purchase_books WHERE id IN (SELECT id FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_period_inventory_closing' THEN
      DELETE FROM public.tab_period_inventory_closing WHERE id IN (SELECT id FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_bank_movements' THEN
      DELETE FROM public.tab_bank_movements WHERE id IN (SELECT id FROM public.tab_bank_movements WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_bank_movements WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_bank_documents' THEN
      DELETE FROM public.tab_bank_documents WHERE id IN (SELECT id FROM public.tab_bank_documents WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_bank_documents WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_bank_import_templates' THEN
      DELETE FROM public.tab_bank_import_templates WHERE id IN (SELECT id FROM public.tab_bank_import_templates WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_bank_import_templates WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_bank_accounts' THEN
      DELETE FROM public.tab_bank_accounts WHERE id IN (SELECT id FROM public.tab_bank_accounts WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_bank_accounts WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_asset_depreciation_schedule' THEN
      DELETE FROM public.fixed_asset_depreciation_schedule WHERE id IN (SELECT id FROM public.fixed_asset_depreciation_schedule WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_asset_depreciation_schedule WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_asset_event_log' THEN
      DELETE FROM public.fixed_asset_event_log WHERE id IN (SELECT id FROM public.fixed_asset_event_log WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_asset_event_log WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_assets' THEN
      DELETE FROM public.fixed_assets WHERE id IN (SELECT id FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_asset_categories' THEN
      DELETE FROM public.fixed_asset_categories WHERE id IN (SELECT id FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_asset_locations' THEN
      DELETE FROM public.fixed_asset_locations WHERE id IN (SELECT id FROM public.fixed_asset_locations WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_asset_locations WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_asset_custodians' THEN
      DELETE FROM public.fixed_asset_custodians WHERE id IN (SELECT id FROM public.fixed_asset_custodians WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_asset_custodians WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_asset_suppliers' THEN
      DELETE FROM public.fixed_asset_suppliers WHERE id IN (SELECT id FROM public.fixed_asset_suppliers WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_asset_suppliers WHERE enterprise_id = p_enterprise_id;
    WHEN 'fixed_asset_policy' THEN
      DELETE FROM public.fixed_asset_policy WHERE id IN (SELECT id FROM public.fixed_asset_policy WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.fixed_asset_policy WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_fx_settlements' THEN
      DELETE FROM public.tab_fx_settlements WHERE id IN (SELECT id FROM public.tab_fx_settlements WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_fx_settlements WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_fx_open_balances' THEN
      DELETE FROM public.tab_fx_open_balances WHERE id IN (SELECT id FROM public.tab_fx_open_balances WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_fx_open_balances WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_fx_revaluation_runs' THEN
      DELETE FROM public.tab_fx_revaluation_runs WHERE id IN (SELECT id FROM public.tab_fx_revaluation_runs WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_fx_revaluation_runs WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_journal_entries' THEN
      DELETE FROM public.tab_journal_entries WHERE id IN (SELECT id FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_integrity_validations' THEN
      DELETE FROM public.tab_integrity_validations WHERE id IN (SELECT id FROM public.tab_integrity_validations WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_integrity_validations WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_accounting_periods' THEN
      DELETE FROM public.tab_accounting_periods WHERE id IN (SELECT id FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_book_folio_consumption' THEN
      DELETE FROM public.tab_book_folio_consumption WHERE id IN (SELECT id FROM public.tab_book_folio_consumption WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_book_folio_consumption WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_book_authorizations' THEN
      DELETE FROM public.tab_book_authorizations WHERE id IN (SELECT id FROM public.tab_book_authorizations WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_book_authorizations WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_integrity_rules_config' THEN
      DELETE FROM public.tab_integrity_rules_config WHERE id IN (SELECT id FROM public.tab_integrity_rules_config WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_integrity_rules_config WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_holidays' THEN
      DELETE FROM public.tab_holidays WHERE id IN (SELECT id FROM public.tab_holidays WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_holidays WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_tax_due_date_config' THEN
      DELETE FROM public.tab_tax_due_date_config WHERE id IN (SELECT id FROM public.tab_tax_due_date_config WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_tax_due_date_config WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_alert_config' THEN
      DELETE FROM public.tab_alert_config WHERE id IN (SELECT id FROM public.tab_alert_config WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_alert_config WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_custom_reminders' THEN
      DELETE FROM public.tab_custom_reminders WHERE id IN (SELECT id FROM public.tab_custom_reminders WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_custom_reminders WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_notifications' THEN
      DELETE FROM public.tab_notifications WHERE id IN (SELECT id FROM public.tab_notifications WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_notifications WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_role_permissions' THEN
      DELETE FROM public.tab_role_permissions WHERE id IN (SELECT id FROM public.tab_role_permissions WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_role_permissions WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_dashboard_card_config' THEN
      DELETE FROM public.tab_dashboard_card_config WHERE id IN (SELECT id FROM public.tab_dashboard_card_config WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_dashboard_card_config WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_backup_history' THEN
      DELETE FROM public.tab_backup_history WHERE id IN (SELECT id FROM public.tab_backup_history WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_backup_history WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_operation_types' THEN
      DELETE FROM public.tab_operation_types WHERE id IN (SELECT id FROM public.tab_operation_types WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_operation_types WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_tax_forms' THEN
      DELETE FROM public.tab_tax_forms WHERE id IN (SELECT id FROM public.tab_tax_forms WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_tax_forms WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_audit_log' THEN
      DELETE FROM public.tab_audit_log WHERE id IN (SELECT id FROM public.tab_audit_log WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_audit_log WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_import_logs' THEN
      DELETE FROM public.tab_import_logs WHERE id IN (SELECT id FROM public.tab_import_logs WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_import_logs WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_exchange_rates' THEN
      DELETE FROM public.tab_exchange_rates WHERE id IN (SELECT id FROM public.tab_exchange_rates WHERE enterprise_id = p_enterprise_id ORDER BY id LIMIT v_batch_size);
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_exchange_rates WHERE enterprise_id = p_enterprise_id;
    WHEN 'tab_accounts' THEN
      DELETE FROM public.tab_accounts WHERE id IN (
        SELECT a.id FROM public.tab_accounts a
        WHERE a.enterprise_id = p_enterprise_id
          AND NOT EXISTS (SELECT 1 FROM public.tab_accounts c WHERE c.parent_account_id = a.id AND c.enterprise_id = p_enterprise_id)
        ORDER BY a.id LIMIT v_batch_size
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT; SELECT COUNT(*) INTO v_remaining FROM public.tab_accounts WHERE enterprise_id = p_enterprise_id;

    ELSE
      RAISE EXCEPTION 'Fase de limpieza no soportada: %', p_phase;
  END CASE;

  RETURN QUERY
  SELECT
    p_phase,
    p_phase,
    COALESCE(v_deleted, 0),
    COALESCE(v_remaining, 0),
    COALESCE(v_remaining, 0) = 0,
    GREATEST(0, ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::integer);
END;
$function$;
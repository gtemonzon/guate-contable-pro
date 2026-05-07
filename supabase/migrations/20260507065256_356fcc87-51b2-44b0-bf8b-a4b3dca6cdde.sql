CREATE OR REPLACE FUNCTION public.hard_reset_legacy_import_phase(p_enterprise_id bigint, p_phase text)
RETURNS TABLE(phase_key text, table_name text, deleted_count bigint, remaining_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_before bigint := 0;
  v_after bigint := 0;
  v_batch bigint := 0;
BEGIN
  PERFORM set_config('app.import_mode', 'on', true);

  CASE p_phase
    WHEN 'purchase_journal_links_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_purchase_journal_links', v_before - v_after, v_after;

    WHEN 'purchase_ledger_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_purchase_ledger', v_before - v_after, v_after;

    WHEN 'purchase_books_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_purchase_books', v_before - v_after, v_after;

    WHEN 'journal_entry_details_clear' THEN
      SELECT count(*) INTO v_before
      FROM public.tab_journal_entry_details d
      JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
      WHERE e.enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_journal_entry_details d
      USING public.tab_journal_entries e
      WHERE e.id = d.journal_entry_id
        AND e.enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after
      FROM public.tab_journal_entry_details d
      JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
      WHERE e.enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_journal_entry_details', v_before - v_after, v_after;

    WHEN 'journal_entries_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_journal_entries', v_before - v_after, v_after;

    WHEN 'fixed_asset_depreciation_schedule_clear' THEN
      SELECT count(*) INTO v_before
      FROM public.fixed_asset_depreciation_schedule d
      JOIN public.fixed_assets a ON a.id = d.asset_id
      WHERE a.enterprise_id = p_enterprise_id;
      DELETE FROM public.fixed_asset_depreciation_schedule d
      USING public.fixed_assets a
      WHERE a.id = d.asset_id
        AND a.enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after
      FROM public.fixed_asset_depreciation_schedule d
      JOIN public.fixed_assets a ON a.id = d.asset_id
      WHERE a.enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'fixed_asset_depreciation_schedule', v_before - v_after, v_after;

    WHEN 'fixed_asset_event_log_clear' THEN
      SELECT count(*) INTO v_before
      FROM public.fixed_asset_event_log l
      WHERE l.enterprise_id = p_enterprise_id;
      DELETE FROM public.fixed_asset_event_log
      WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after
      FROM public.fixed_asset_event_log l
      WHERE l.enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'fixed_asset_event_log', v_before - v_after, v_after;

    WHEN 'fixed_assets_clear' THEN
      SELECT count(*) INTO v_before FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'fixed_assets', v_before - v_after, v_after;

    WHEN 'asset_categories_clear' THEN
      SELECT count(*) INTO v_before FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'fixed_asset_categories', v_before - v_after, v_after;

    WHEN 'sales_ledger_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_sales_ledger', v_before - v_after, v_after;

    WHEN 'inventory_closings_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_period_inventory_closing', v_before - v_after, v_after;

    WHEN 'periods_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
      DELETE FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
      SELECT count(*) INTO v_after FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_accounting_periods', v_before - v_after, v_after;

    WHEN 'accounts_clear' THEN
      SELECT count(*) INTO v_before FROM public.tab_accounts WHERE enterprise_id = p_enterprise_id;
      LOOP
        DELETE FROM public.tab_accounts a
        WHERE a.enterprise_id = p_enterprise_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.tab_accounts c
            WHERE c.parent_account_id = a.id
              AND c.enterprise_id = p_enterprise_id
          );
        GET DIAGNOSTICS v_batch = ROW_COUNT;
        EXIT WHEN v_batch = 0;
      END LOOP;
      SELECT count(*) INTO v_after FROM public.tab_accounts WHERE enterprise_id = p_enterprise_id;
      RETURN QUERY SELECT p_phase, 'tab_accounts', v_before - v_after, v_after;

    ELSE
      RAISE EXCEPTION 'Fase de hard reset no soportada: %', p_phase;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_reset_legacy_import_phase(bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_reset_legacy_import_phase(bigint, text) TO authenticated;
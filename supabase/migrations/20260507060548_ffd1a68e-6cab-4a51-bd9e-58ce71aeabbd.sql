CREATE OR REPLACE FUNCTION public.clear_legacy_import_block(p_enterprise_id bigint, p_block text)
RETURNS TABLE(block_key text, table_name text, deleted_count bigint, remaining_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
  v_remaining bigint;
BEGIN
  IF p_block NOT IN ('accounts_periods', 'purchases', 'sales', 'journal_entries', 'fixed_assets', 'asset_categories', 'all') THEN
    RAISE EXCEPTION 'Bloque no soportado: %', p_block;
  END IF;

  PERFORM set_config('session_replication_role', 'replica', true);

  IF p_block IN ('journal_entries', 'accounts_periods', 'all') THEN
    LOOP
      DELETE FROM public.tab_journal_entry_details
      WHERE id IN (
        SELECT d.id
        FROM public.tab_journal_entry_details d
        JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
        WHERE e.enterprise_id = p_enterprise_id
        LIMIT 1000
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    LOOP
      DELETE FROM public.tab_journal_entries
      WHERE id IN (
        SELECT id
        FROM public.tab_journal_entries
        WHERE enterprise_id = p_enterprise_id
        LIMIT 500
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    SELECT count(*) INTO v_remaining FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'journal_entries', 'tab_journal_entries', 0::bigint, v_remaining;
  END IF;

  IF p_block IN ('fixed_assets', 'asset_categories', 'accounts_periods', 'all') THEN
    LOOP
      DELETE FROM public.fixed_asset_depreciation_schedule
      WHERE id IN (
        SELECT d.id
        FROM public.fixed_asset_depreciation_schedule d
        JOIN public.fixed_assets a ON a.id = d.asset_id
        WHERE a.enterprise_id = p_enterprise_id
        LIMIT 1000
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    LOOP
      DELETE FROM public.fixed_asset_event_log
      WHERE id IN (
        SELECT l.id
        FROM public.fixed_asset_event_log l
        JOIN public.fixed_assets a ON a.id = l.asset_id
        WHERE a.enterprise_id = p_enterprise_id
        LIMIT 1000
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    LOOP
      DELETE FROM public.fixed_assets
      WHERE id IN (
        SELECT id
        FROM public.fixed_assets
        WHERE enterprise_id = p_enterprise_id
        LIMIT 500
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    IF p_block IN ('asset_categories', 'accounts_periods', 'all') THEN
      LOOP
        DELETE FROM public.fixed_asset_categories
        WHERE id IN (
          SELECT id
          FROM public.fixed_asset_categories
          WHERE enterprise_id = p_enterprise_id
          LIMIT 500
        );
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        EXIT WHEN v_deleted = 0;
      END LOOP;
    END IF;

    SELECT count(*) INTO v_remaining FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'fixed_assets', 'fixed_assets', 0::bigint, v_remaining;
    SELECT count(*) INTO v_remaining FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'asset_categories', 'fixed_asset_categories', 0::bigint, v_remaining;
  END IF;

  IF p_block IN ('purchases', 'accounts_periods', 'all') THEN
    LOOP
      DELETE FROM public.tab_purchase_journal_links
      WHERE id IN (
        SELECT id
        FROM public.tab_purchase_journal_links
        WHERE enterprise_id = p_enterprise_id
        LIMIT 1000
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    LOOP
      DELETE FROM public.tab_purchase_ledger
      WHERE id IN (
        SELECT id
        FROM public.tab_purchase_ledger
        WHERE enterprise_id = p_enterprise_id
        LIMIT 1000
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    LOOP
      DELETE FROM public.tab_purchase_books
      WHERE id IN (
        SELECT id
        FROM public.tab_purchase_books
        WHERE enterprise_id = p_enterprise_id
        LIMIT 200
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    SELECT count(*) INTO v_remaining FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'purchases', 'tab_purchase_ledger', 0::bigint, v_remaining;
    SELECT count(*) INTO v_remaining FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'purchase_books', 'tab_purchase_books', 0::bigint, v_remaining;
  END IF;

  IF p_block IN ('sales', 'accounts_periods', 'all') THEN
    LOOP
      DELETE FROM public.tab_sales_ledger
      WHERE id IN (
        SELECT id
        FROM public.tab_sales_ledger
        WHERE enterprise_id = p_enterprise_id
        LIMIT 1000
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    SELECT count(*) INTO v_remaining FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'sales', 'tab_sales_ledger', 0::bigint, v_remaining;
  END IF;

  IF p_block IN ('accounts_periods', 'all') THEN
    LOOP
      DELETE FROM public.tab_period_inventory_closing
      WHERE id IN (
        SELECT id
        FROM public.tab_period_inventory_closing
        WHERE enterprise_id = p_enterprise_id
        LIMIT 1000
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    LOOP
      DELETE FROM public.tab_accounting_periods
      WHERE id IN (
        SELECT id
        FROM public.tab_accounting_periods
        WHERE enterprise_id = p_enterprise_id
        LIMIT 500
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    LOOP
      DELETE FROM public.tab_accounts
      WHERE id IN (
        SELECT a.id
        FROM public.tab_accounts a
        WHERE a.enterprise_id = p_enterprise_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.tab_accounts c
            WHERE c.parent_account_id = a.id
              AND c.enterprise_id = p_enterprise_id
          )
        LIMIT 500
      );
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      EXIT WHEN v_deleted = 0;
    END LOOP;

    SELECT count(*) INTO v_remaining FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'periods', 'tab_accounting_periods', 0::bigint, v_remaining;
    SELECT count(*) INTO v_remaining FROM public.tab_accounts WHERE enterprise_id = p_enterprise_id;
    RETURN QUERY SELECT 'accounts', 'tab_accounts', 0::bigint, v_remaining;
  END IF;

  PERFORM set_config('session_replication_role', 'origin', true);
  RETURN;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('session_replication_role', 'origin', true);
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_legacy_import_block(bigint, text) TO authenticated;
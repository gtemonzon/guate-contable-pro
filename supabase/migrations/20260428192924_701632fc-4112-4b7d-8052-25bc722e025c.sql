
DROP FUNCTION IF EXISTS public.reset_legacy_import_data(bigint);
DROP FUNCTION IF EXISTS public.reset_legacy_import_data(integer);

CREATE OR REPLACE FUNCTION public.reset_legacy_import_data(p_enterprise_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch int;
BEGIN
  SET LOCAL session_replication_role = 'replica';

  LOOP
    DELETE FROM public.tab_journal_entry_details
    WHERE id IN (
      SELECT d.id
      FROM public.tab_journal_entry_details d
      JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
      WHERE e.enterprise_id = p_enterprise_id
      LIMIT 5000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    EXIT WHEN v_batch = 0;
  END LOOP;

  LOOP
    DELETE FROM public.tab_journal_entries
    WHERE id IN (
      SELECT id FROM public.tab_journal_entries
      WHERE enterprise_id = p_enterprise_id
      LIMIT 2000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    EXIT WHEN v_batch = 0;
  END LOOP;

  DELETE FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;

  DELETE FROM public.fixed_asset_depreciation_schedule
    WHERE asset_id IN (SELECT id FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id);
  DELETE FROM public.fixed_asset_event_log
    WHERE asset_id IN (SELECT id FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id);
  DELETE FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;

  LOOP
    DELETE FROM public.tab_accounts
    WHERE enterprise_id = p_enterprise_id
      AND id NOT IN (
        SELECT parent_account_id FROM public.tab_accounts
        WHERE enterprise_id = p_enterprise_id AND parent_account_id IS NOT NULL
      );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    EXIT WHEN v_batch = 0;
  END LOOP;

  DELETE FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_legacy_import_jobs WHERE enterprise_id = p_enterprise_id;

  SET LOCAL session_replication_role = 'origin';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_legacy_import_data(bigint) TO authenticated;

SELECT public.reset_legacy_import_data(33);

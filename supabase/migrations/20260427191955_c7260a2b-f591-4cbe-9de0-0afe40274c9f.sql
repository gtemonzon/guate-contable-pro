
DO $$
DECLARE eid INT := 33;
BEGIN
  DELETE FROM tab_journal_entry_details WHERE journal_entry_id IN (SELECT id FROM tab_journal_entries WHERE enterprise_id = eid);
  DELETE FROM tab_journal_entries WHERE enterprise_id = eid;
  DELETE FROM tab_purchase_ledger WHERE enterprise_id = eid;
  DELETE FROM tab_purchase_books WHERE enterprise_id = eid;
  DELETE FROM tab_sales_ledger WHERE enterprise_id = eid;
  DELETE FROM fixed_assets WHERE enterprise_id = eid;
  DELETE FROM fixed_asset_categories WHERE enterprise_id = eid;
  DELETE FROM tab_accounting_periods WHERE enterprise_id = eid;
  DELETE FROM tab_accounts WHERE enterprise_id = eid;
END $$;


-- Unlink ledger records
UPDATE public.tab_purchase_ledger SET journal_entry_id = NULL WHERE journal_entry_id IN (30433, 30434);
UPDATE public.tab_sales_ledger SET journal_entry_id = NULL WHERE journal_entry_id IN (30433, 30434);

-- Delete details then headers (bypass immutability guards)
DELETE FROM public.tab_journal_entry_details WHERE journal_entry_id IN (30433, 30434);
DELETE FROM public.tab_journal_entries WHERE id IN (30433, 30434);

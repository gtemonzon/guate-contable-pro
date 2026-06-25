-- Fix draft entry PART-2026-05-0005 (CARBOFERT, enterprise 37, entry 22646)
-- The TOURISM_TAX 16.39 from invoice 40D9888E-1380992612 was missing
-- from the Viáticos line and from the bank credit at generation time.
-- Current accounting engine folds Non-VAT into expense when no per-category
-- mapping exists; we apply the same correction here.
UPDATE public.tab_journal_entry_details
   SET debit_amount = 180.33
 WHERE journal_entry_id = 22646 AND account_id = 7316 AND debit_amount = 163.94;

UPDATE public.tab_journal_entry_details
   SET credit_amount = 47763.98
 WHERE journal_entry_id = 22646 AND account_id = 7305 AND credit_amount = 47747.59;

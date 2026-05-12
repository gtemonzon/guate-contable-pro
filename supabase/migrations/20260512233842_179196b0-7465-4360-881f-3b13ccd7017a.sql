-- Corregir póliza COMP-2026-04 (Soto, Soto): sumar IDP de combustible (51.86) a la cuenta de gasto 510216
UPDATE public.tab_journal_entry_details
SET debit_amount = ROUND(debit_amount + 51.86, 2)
WHERE journal_entry_id = 22598
  AND account_id = (
    SELECT id FROM public.tab_accounts
    WHERE account_code = '510216'
      AND enterprise_id = (SELECT enterprise_id FROM public.tab_journal_entries WHERE id = 22598)
    LIMIT 1
  );
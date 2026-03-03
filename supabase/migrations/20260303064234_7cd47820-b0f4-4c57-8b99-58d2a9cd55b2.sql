-- Unique partial index: prevent duplicate bank references per bank account per enterprise
-- Excludes anulado entries, soft-deleted entries, and reversal entries (REV-)
CREATE UNIQUE INDEX uq_journal_entry_bank_ref_per_account
  ON public.tab_journal_entries (enterprise_id, bank_account_id, bank_reference)
  WHERE bank_account_id IS NOT NULL
    AND bank_reference IS NOT NULL
    AND bank_reference != ''
    AND status != 'anulado'
    AND deleted_at IS NULL
    AND entry_number NOT LIKE 'REV-%';

-- Add bank_direction to journal entries header
ALTER TABLE public.tab_journal_entries
  ADD COLUMN IF NOT EXISTS bank_direction text DEFAULT NULL;

-- Add is_bank_line to journal entry details
ALTER TABLE public.tab_journal_entry_details
  ADD COLUMN IF NOT EXISTS is_bank_line boolean NOT NULL DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.tab_journal_entries.bank_direction IS 'Bank movement direction: OUT (payment/check) or IN (deposit/income). NULL when no bank account selected.';
COMMENT ON COLUMN public.tab_journal_entry_details.is_bank_line IS 'System-managed bank line that auto-balances with the selected bank account.';

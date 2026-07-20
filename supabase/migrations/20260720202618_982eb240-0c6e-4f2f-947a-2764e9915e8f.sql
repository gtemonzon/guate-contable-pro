
ALTER TABLE public.tab_collection_payments
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('efectivo','cheque','transferencia','otro')),
  ADD COLUMN IF NOT EXISTS receipt_number text,
  ADD COLUMN IF NOT EXISTS bank_account_id bigint REFERENCES public.tab_bank_accounts(id),
  ADD COLUMN IF NOT EXISTS journal_entry_id bigint REFERENCES public.tab_journal_entries(id);

CREATE INDEX IF NOT EXISTS idx_collection_payments_journal_entry ON public.tab_collection_payments(journal_entry_id) WHERE journal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_payments_bank_account ON public.tab_collection_payments(bank_account_id) WHERE bank_account_id IS NOT NULL;

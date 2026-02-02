-- Agregar campos bancarios al encabezado de la partida contable
ALTER TABLE public.tab_journal_entries
ADD COLUMN bank_account_id bigint REFERENCES public.tab_accounts(id),
ADD COLUMN bank_reference text,
ADD COLUMN beneficiary_name text;

-- Crear índice para búsquedas por cuenta bancaria
CREATE INDEX idx_journal_entries_bank_account ON public.tab_journal_entries(bank_account_id) WHERE bank_account_id IS NOT NULL;

-- Comentarios descriptivos
COMMENT ON COLUMN public.tab_journal_entries.bank_account_id IS 'Cuenta bancaria asociada a la partida (para cheques, transferencias, etc.)';
COMMENT ON COLUMN public.tab_journal_entries.bank_reference IS 'Número de cheque, transferencia u otro documento bancario';
COMMENT ON COLUMN public.tab_journal_entries.beneficiary_name IS 'Nombre del beneficiario del cheque o transferencia';
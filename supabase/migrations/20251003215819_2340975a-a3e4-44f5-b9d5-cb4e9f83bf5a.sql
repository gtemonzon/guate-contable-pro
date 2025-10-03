-- Agregar campo de referencia bancaria a las líneas de detalle de partidas
ALTER TABLE public.tab_journal_entry_details
ADD COLUMN bank_reference text;

COMMENT ON COLUMN public.tab_journal_entry_details.bank_reference IS 'Referencia bancaria: número de cheque, transferencia, documento de estado de cuenta, etc.';
-- Add IDP (Impuesto a Distribución de Petróleo) amount column to purchase ledger
ALTER TABLE public.tab_purchase_ledger
ADD COLUMN idp_amount numeric DEFAULT 0;

COMMENT ON COLUMN public.tab_purchase_ledger.idp_amount IS 'Impuesto a Distribución de Petróleo (IDP) - used for fuel invoices in Guatemala';

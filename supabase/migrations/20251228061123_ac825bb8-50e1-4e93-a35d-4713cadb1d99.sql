-- Add is_annulled column to sales ledger
ALTER TABLE public.tab_sales_ledger 
ADD COLUMN is_annulled boolean NOT NULL DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN public.tab_sales_ledger.is_annulled IS 'Indica si la factura está anulada';
-- Delete duplicate purchase records (keep the oldest ones - lower IDs)
DELETE FROM public.tab_purchase_ledger WHERE id IN (9);

-- Delete duplicate sales records (keep the oldest ones - lower IDs)
DELETE FROM public.tab_sales_ledger WHERE id IN (4);

-- Add unique constraint for purchase ledger to prevent duplicate documents
ALTER TABLE public.tab_purchase_ledger 
ADD CONSTRAINT unique_purchase_document 
UNIQUE (supplier_nit, fel_document_type, invoice_series, invoice_number, purchase_book_id);

-- Add unique index for sales ledger to prevent duplicate documents
CREATE UNIQUE INDEX unique_sales_document 
ON public.tab_sales_ledger (
  customer_nit, 
  fel_document_type, 
  COALESCE(invoice_series, ''), 
  invoice_number, 
  enterprise_id,
  EXTRACT(MONTH FROM invoice_date),
  EXTRACT(YEAR FROM invoice_date)
);
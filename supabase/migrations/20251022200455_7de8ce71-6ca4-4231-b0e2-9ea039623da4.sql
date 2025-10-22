-- Eliminar el índice único anterior de ventas que incluía customer_nit
DROP INDEX IF EXISTS public.unique_sales_document;

-- Crear nuevo índice único solo con tipo, serie y número (sin NIT de cliente)
CREATE UNIQUE INDEX unique_sales_document 
ON public.tab_sales_ledger (
  fel_document_type, 
  COALESCE(invoice_series, ''), 
  invoice_number, 
  enterprise_id,
  EXTRACT(MONTH FROM invoice_date),
  EXTRACT(YEAR FROM invoice_date)
);
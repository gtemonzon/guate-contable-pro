CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_ledger_unique_invoice 
ON public.tab_purchase_ledger (enterprise_id, supplier_nit, fel_document_type, COALESCE(invoice_series, ''), invoice_number)
WHERE deleted_at IS NULL;
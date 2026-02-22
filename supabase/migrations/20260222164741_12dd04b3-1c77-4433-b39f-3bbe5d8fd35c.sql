
-- Add unique constraint for idempotent upsert on bank documents
ALTER TABLE public.tab_bank_documents 
  ADD CONSTRAINT uq_bank_doc_enterprise_account_number 
  UNIQUE (enterprise_id, bank_account_id, document_number);

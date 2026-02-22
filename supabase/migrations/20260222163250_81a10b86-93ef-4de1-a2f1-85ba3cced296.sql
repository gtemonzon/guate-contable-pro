
-- Create the updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Bank documents table for cheques and other bank instruments
CREATE TABLE public.tab_bank_documents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id),
  bank_account_id bigint REFERENCES public.tab_bank_accounts(id),
  document_number text NOT NULL,
  direction text NOT NULL DEFAULT 'OUT' CHECK (direction IN ('OUT', 'IN')),
  document_date date NOT NULL,
  beneficiary_name text,
  concept text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ISSUED', 'POSTED', 'VOID')),
  void_date date,
  void_reason text,
  journal_entry_id bigint REFERENCES public.tab_journal_entries(id),
  reversal_journal_entry_id bigint REFERENCES public.tab_journal_entries(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_documents_enterprise ON public.tab_bank_documents(enterprise_id);
CREATE INDEX idx_bank_documents_bank_account ON public.tab_bank_documents(bank_account_id);
CREATE INDEX idx_bank_documents_journal_entry ON public.tab_bank_documents(journal_entry_id);

ALTER TABLE public.tab_bank_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_documents_select" ON public.tab_bank_documents
  FOR SELECT USING (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "bank_documents_insert" ON public.tab_bank_documents
  FOR INSERT WITH CHECK (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "bank_documents_update" ON public.tab_bank_documents
  FOR UPDATE USING (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "bank_documents_delete" ON public.tab_bank_documents
  FOR DELETE USING (
    is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE TRIGGER update_bank_documents_updated_at
  BEFORE UPDATE ON public.tab_bank_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

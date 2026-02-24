
-- Part A: Create linking table for purchase-to-journal-entry relationships
CREATE TABLE public.tab_purchase_journal_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  purchase_id BIGINT NOT NULL REFERENCES public.tab_purchase_ledger(id) ON DELETE CASCADE,
  journal_entry_id BIGINT NOT NULL REFERENCES public.tab_journal_entries(id) ON DELETE CASCADE,
  link_source TEXT NOT NULL DEFAULT 'MANUAL_LINK',
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by UUID NOT NULL DEFAULT auth.uid(),
  CONSTRAINT uq_purchase_journal_link UNIQUE (enterprise_id, purchase_id)
);

-- Indexes for performance
CREATE INDEX idx_pjl_enterprise ON public.tab_purchase_journal_links(enterprise_id);
CREATE INDEX idx_pjl_journal_entry ON public.tab_purchase_journal_links(journal_entry_id);
CREATE INDEX idx_pjl_purchase ON public.tab_purchase_journal_links(purchase_id);

-- Enable RLS
ALTER TABLE public.tab_purchase_journal_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users with access to the enterprise can manage links
CREATE POLICY "Users can view links for their enterprises"
ON public.tab_purchase_journal_links
FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
);

CREATE POLICY "Users can insert links for their enterprises"
ON public.tab_purchase_journal_links
FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
);

CREATE POLICY "Users can delete links for their enterprises"
ON public.tab_purchase_journal_links
FOR DELETE
USING (
  public.is_super_admin(auth.uid())
  OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
);

-- Trigger: Sync journal_entry_id on tab_purchase_ledger when a link is created
CREATE OR REPLACE FUNCTION public.sync_purchase_journal_entry_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.tab_purchase_ledger
    SET journal_entry_id = NEW.journal_entry_id
    WHERE id = NEW.purchase_id AND enterprise_id = NEW.enterprise_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.tab_purchase_ledger
    SET journal_entry_id = NULL
    WHERE id = OLD.purchase_id AND enterprise_id = OLD.enterprise_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sync_purchase_je_id
AFTER INSERT OR DELETE ON public.tab_purchase_journal_links
FOR EACH ROW
EXECUTE FUNCTION public.sync_purchase_journal_entry_id();

-- Audit trigger
CREATE TRIGGER audit_purchase_journal_links
AFTER INSERT OR UPDATE OR DELETE ON public.tab_purchase_journal_links
FOR EACH ROW
EXECUTE FUNCTION public.audit_event_log_trigger();

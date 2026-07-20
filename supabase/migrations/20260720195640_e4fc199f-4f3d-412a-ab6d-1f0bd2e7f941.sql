
-- ============ 1. tab_tenant_modules ============
CREATE TABLE public.tab_tenant_modules (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tab_tenants(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL CHECK (module_key IN ('cxc','cxp','inventario','tax_avanzada')),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (tenant_id, module_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_tenant_modules TO authenticated;
GRANT ALL ON public.tab_tenant_modules TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_tenant_modules_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_tenant_modules_id_seq TO service_role;

ALTER TABLE public.tab_tenant_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read tenant modules" ON public.tab_tenant_modules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "super admin insert tenant modules" ON public.tab_tenant_modules
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tab_users WHERE id = auth.uid() AND is_super_admin = true));

CREATE POLICY "super admin update tenant modules" ON public.tab_tenant_modules
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tab_users WHERE id = auth.uid() AND is_super_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tab_users WHERE id = auth.uid() AND is_super_admin = true));

CREATE POLICY "super admin delete tenant modules" ON public.tab_tenant_modules
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tab_users WHERE id = auth.uid() AND is_super_admin = true));

-- ============ 2. Collection tables ============
CREATE TABLE public.tab_collection_terms (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL,
  days INTEGER NOT NULL CHECK (days >= 0),
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_collection_terms TO authenticated;
GRANT ALL ON public.tab_collection_terms TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_collection_terms_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_collection_terms_id_seq TO service_role;
ALTER TABLE public.tab_collection_terms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enterprise collection terms" ON public.tab_collection_terms
  FOR ALL TO authenticated
  USING (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
  WITH CHECK (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()));

CREATE TABLE public.tab_collection_reasons (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'both' CHECK (direction IN ('cxc','cxp','both')),
  reason_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_collection_reasons TO authenticated;
GRANT ALL ON public.tab_collection_reasons TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_collection_reasons_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_collection_reasons_id_seq TO service_role;
ALTER TABLE public.tab_collection_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enterprise collection reasons" ON public.tab_collection_reasons
  FOR ALL TO authenticated
  USING (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
  WITH CHECK (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()));

CREATE TABLE public.tab_collection_tracking (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('cxc','cxp')),
  source_ledger_id BIGINT NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  payment_term_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','parcial','pagada')),
  amount_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (direction, source_ledger_id)
);
CREATE INDEX idx_collection_tracking_source ON public.tab_collection_tracking (direction, source_ledger_id);
CREATE INDEX idx_collection_tracking_enterprise ON public.tab_collection_tracking (enterprise_id, direction, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_collection_tracking TO authenticated;
GRANT ALL ON public.tab_collection_tracking TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_collection_tracking_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_collection_tracking_id_seq TO service_role;
ALTER TABLE public.tab_collection_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enterprise collection tracking" ON public.tab_collection_tracking
  FOR ALL TO authenticated
  USING (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
  WITH CHECK (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()));

CREATE TABLE public.tab_collection_payments (
  id BIGSERIAL PRIMARY KEY,
  tracking_id BIGINT NOT NULL REFERENCES public.tab_collection_tracking(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL,
  payment_date DATE NOT NULL,
  note TEXT,
  recorded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_collection_payments_tracking ON public.tab_collection_payments (tracking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_collection_payments TO authenticated;
GRANT ALL ON public.tab_collection_payments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_collection_payments_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_collection_payments_id_seq TO service_role;
ALTER TABLE public.tab_collection_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enterprise collection payments" ON public.tab_collection_payments
  FOR ALL TO authenticated
  USING (tracking_id IN (SELECT id FROM public.tab_collection_tracking WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())))
  WITH CHECK (tracking_id IN (SELECT id FROM public.tab_collection_tracking WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())));

CREATE TABLE public.tab_collection_status_history (
  id BIGSERIAL PRIMARY KEY,
  tracking_id BIGINT NOT NULL REFERENCES public.tab_collection_tracking(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  reason TEXT,
  changed_by UUID,
  changed_by_name TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_manual BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_collection_status_history_tracking ON public.tab_collection_status_history (tracking_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_collection_status_history TO authenticated;
GRANT ALL ON public.tab_collection_status_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_collection_status_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_collection_status_history_id_seq TO service_role;
ALTER TABLE public.tab_collection_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enterprise collection status history" ON public.tab_collection_status_history
  FOR ALL TO authenticated
  USING (tracking_id IN (SELECT id FROM public.tab_collection_tracking WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())))
  WITH CHECK (tracking_id IN (SELECT id FROM public.tab_collection_tracking WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())));

-- ============ 3. Helper function & triggers ============
CREATE OR REPLACE FUNCTION public.calculate_due_date(p_enterprise_id BIGINT, p_issue_date DATE, p_term_days INTEGER)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  -- Phase 1: naive addition. Phase 3 will adjust for business days.
  RETURN p_issue_date + p_term_days;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_create_collection_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_direction TEXT;
  v_term INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'tab_purchase_ledger' THEN
    v_direction := 'cxp';
  ELSIF TG_TABLE_NAME = 'tab_sales_ledger' THEN
    v_direction := 'cxc';
  ELSE
    RETURN NEW;
  END IF;

  SELECT days INTO v_term
    FROM public.tab_collection_terms
   WHERE enterprise_id = NEW.enterprise_id AND is_default = true
   ORDER BY sort_order ASC
   LIMIT 1;

  IF v_term IS NULL THEN
    v_term := 30;
  END IF;

  INSERT INTO public.tab_collection_tracking (
    enterprise_id, direction, source_ledger_id, issue_date, due_date,
    payment_term_days, status, amount_total, amount_paid
  ) VALUES (
    NEW.enterprise_id, v_direction, NEW.id, NEW.invoice_date,
    public.calculate_due_date(NEW.enterprise_id, NEW.invoice_date, v_term),
    v_term, 'pendiente', COALESCE(NEW.total_amount, 0), 0
  )
  ON CONFLICT (direction, source_ledger_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_purchase_ledger_collection_tracking
  AFTER INSERT ON public.tab_purchase_ledger
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_collection_tracking();

CREATE TRIGGER trg_sales_ledger_collection_tracking
  AFTER INSERT ON public.tab_sales_ledger
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_collection_tracking();

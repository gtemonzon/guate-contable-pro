
CREATE TABLE IF NOT EXISTS public.tab_isr_income_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  regime TEXT NOT NULL CHECK (regime IN ('actividades_lucrativas','rentas_capital_inmobiliario','rentas_capital_mobiliario')),
  default_percentage NUMERIC(7,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, regime)
);
GRANT SELECT ON public.tab_isr_income_categories TO authenticated;
GRANT ALL ON public.tab_isr_income_categories TO service_role;
ALTER TABLE public.tab_isr_income_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "isr_categories_read_authenticated" ON public.tab_isr_income_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "isr_categories_super_admin_write" ON public.tab_isr_income_categories FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

INSERT INTO public.tab_isr_income_categories (name, description, regime, default_percentage, display_order) VALUES
  ('Servicios Profesionales', 'Honorarios por servicios profesionales', 'actividades_lucrativas', 7.00, 1),
  ('Arrendamientos', 'Alquiler de bienes inmuebles', 'rentas_capital_inmobiliario', 10.00, 2),
  ('Intereses', 'Intereses sobre capital', 'rentas_capital_mobiliario', 10.00, 3),
  ('Dividendos', 'Distribución de utilidades', 'rentas_capital_mobiliario', 5.00, 4),
  ('Transporte', 'Servicios de transporte', 'actividades_lucrativas', 5.00, 5),
  ('Otros', 'Otras categorías de renta', 'actividades_lucrativas', 5.00, 99)
ON CONFLICT (name, regime) DO NOTHING;

ALTER TABLE public.tab_enterprise_config
  ADD COLUMN IF NOT EXISTS issues_isr_retention_certificates BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS issues_vat_retention_certificates BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS issues_vat_exemption_certificates BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_vat_retained_receivable_id BIGINT REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_vat_retained_payable_id BIGINT REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_vat_exemption_control_id BIGINT REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_isr_retained_receivable_id BIGINT REFERENCES public.tab_accounts(id),
  ADD COLUMN IF NOT EXISTS account_isr_retained_payable_id BIGINT REFERENCES public.tab_accounts(id);

CREATE TABLE IF NOT EXISTS public.tab_tax_certificates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tab_tenants(id) ON DELETE CASCADE,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  period_id BIGINT REFERENCES public.tab_accounting_periods(id),
  direction TEXT NOT NULL CHECK (direction IN ('issued','received')),
  document_type TEXT NOT NULL CHECK (document_type IN ('isr_retention','vat_retention','vat_exemption')),
  counterpart_nit TEXT NOT NULL,
  counterpart_name TEXT NOT NULL,
  document_number TEXT NOT NULL,
  authorization_number TEXT,
  series TEXT,
  issue_date DATE NOT NULL,
  base_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(7,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  isr_regime TEXT CHECK (isr_regime IS NULL OR isr_regime IN ('actividades_lucrativas','rentas_capital_inmobiliario','rentas_capital_mobiliario')),
  isr_category_id BIGINT REFERENCES public.tab_isr_income_categories(id),
  purchase_ledger_id BIGINT REFERENCES public.tab_purchase_ledger(id) ON DELETE SET NULL,
  sales_ledger_id BIGINT REFERENCES public.tab_sales_ledger(id) ON DELETE SET NULL,
  journal_entry_id BIGINT REFERENCES public.tab_journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tax_certificates_enterprise_date ON public.tab_tax_certificates(enterprise_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_certificates_type_dir ON public.tab_tax_certificates(document_type, direction);
CREATE INDEX IF NOT EXISTS idx_tax_certificates_nit ON public.tab_tax_certificates(counterpart_nit);
CREATE INDEX IF NOT EXISTS idx_tax_certificates_period ON public.tab_tax_certificates(period_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_certificates_doc
  ON public.tab_tax_certificates(enterprise_id, document_type, direction, counterpart_nit, document_number)
  WHERE status <> 'void';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_tax_certificates TO authenticated;
GRANT ALL ON public.tab_tax_certificates TO service_role;
ALTER TABLE public.tab_tax_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_certificates_tenant_read" ON public.tab_tax_certificates FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tax_certificates_tenant_insert" ON public.tab_tax_certificates FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "tax_certificates_tenant_update_draft" ON public.tab_tax_certificates FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND status <> 'posted')
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "tax_certificates_tenant_delete_draft" ON public.tab_tax_certificates FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND status = 'draft');

CREATE OR REPLACE FUNCTION public.tax_certificates_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_tax_certificates_updated_at ON public.tab_tax_certificates;
CREATE TRIGGER trg_tax_certificates_updated_at BEFORE UPDATE ON public.tab_tax_certificates
FOR EACH ROW EXECUTE FUNCTION public.tax_certificates_set_updated_at();

CREATE TABLE IF NOT EXISTS public.tab_tax_certificate_ingestion_sources (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tab_tenants(id) ON DELETE CASCADE,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  certificate_id BIGINT REFERENCES public.tab_tax_certificates(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('pdf','xml','image')),
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','failed')),
  raw_payload JSONB,
  error_message TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_tax_certificate_ingestion_sources TO authenticated;
GRANT ALL ON public.tab_tax_certificate_ingestion_sources TO service_role;
ALTER TABLE public.tab_tax_certificate_ingestion_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tax_cert_ingestion_tenant_all" ON public.tab_tax_certificate_ingestion_sources FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND created_by = auth.uid());

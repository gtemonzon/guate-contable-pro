
-- Helper: is_super_admin check (SECURITY DEFINER to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.tab_users WHERE id = auth.uid()), false);
$$;

-- Quote number generator
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y text := to_char(now(), 'YYYY');
  n int;
BEGIN
  SELECT COALESCE(MAX((regexp_replace(quote_number, '^COT-\d{4}-', ''))::int), 0) + 1
    INTO n
  FROM public.tab_quotes
  WHERE quote_number LIKE 'COT-' || y || '-%';
  RETURN 'COT-' || y || '-' || lpad(n::text, 3, '0');
END;
$$;

-- tab_quotes
CREATE TABLE public.tab_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text UNIQUE NOT NULL,
  client_name text NOT NULL,
  client_nit text,
  client_contact text,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  valid_until date,
  status text NOT NULL DEFAULT 'elaborada' CHECK (status IN ('elaborada','enviada','confirmada','no_aceptada')),
  notes text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_quotes TO authenticated;
GRANT ALL ON public.tab_quotes TO service_role;
ALTER TABLE public.tab_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all_quotes" ON public.tab_quotes
  FOR ALL TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());

-- tab_quote_items
CREATE TABLE public.tab_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.tab_quotes(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_quote_items TO authenticated;
GRANT ALL ON public.tab_quote_items TO service_role;
ALTER TABLE public.tab_quote_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all_quote_items" ON public.tab_quote_items
  FOR ALL TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());
CREATE INDEX idx_quote_items_quote_id ON public.tab_quote_items(quote_id);

-- tab_quote_status_history
CREATE TABLE public.tab_quote_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.tab_quotes(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_by uuid NOT NULL REFERENCES auth.users(id),
  changed_by_name text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_quote_status_history TO authenticated;
GRANT ALL ON public.tab_quote_status_history TO service_role;
ALTER TABLE public.tab_quote_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all_quote_history" ON public.tab_quote_status_history
  FOR ALL TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());
CREATE INDEX idx_quote_history_quote_id ON public.tab_quote_status_history(quote_id);

-- tab_quote_price_catalog
CREATE TABLE public.tab_quote_price_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  default_unit_price numeric(14,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_quote_price_catalog TO authenticated;
GRANT ALL ON public.tab_quote_price_catalog TO service_role;
ALTER TABLE public.tab_quote_price_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin_all_quote_catalog" ON public.tab_quote_price_catalog
  FOR ALL TO authenticated
  USING (public.is_current_user_super_admin())
  WITH CHECK (public.is_current_user_super_admin());

-- Seed catalog
INSERT INTO public.tab_quote_price_catalog (description, default_unit_price, sort_order) VALUES
  ('Contabilidad mensual', 0, 1),
  ('Declaración mensual IVA', 0, 2),
  ('Declaración ISR trimestral/anual', 0, 3),
  ('Procesamiento de nómina', 0, 4),
  ('Cierre contable anual', 0, 5),
  ('Asesoría fiscal (hora)', 0, 6);

-- updated_at trigger fn (reuse if exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_tab_quotes_updated BEFORE UPDATE ON public.tab_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tab_quote_price_catalog_updated BEFORE UPDATE ON public.tab_quote_price_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

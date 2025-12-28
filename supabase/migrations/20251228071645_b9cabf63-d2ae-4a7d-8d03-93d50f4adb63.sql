
-- 1. Crear tabla de configuración de empresa
CREATE TABLE public.tab_enterprise_config (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id bigint NOT NULL UNIQUE,
  vat_credit_account_id bigint,
  vat_debit_account_id bigint,
  period_result_account_id bigint,
  initial_inventory_account_id bigint,
  final_inventory_account_id bigint,
  purchases_account_id bigint,
  sales_account_id bigint,
  customers_account_id bigint,
  suppliers_account_id bigint,
  created_at timestamptz DEFAULT now()
);

-- 2. Crear tabla de formatos de estados financieros
CREATE TABLE public.tab_financial_statement_formats (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id bigint NOT NULL,
  format_type text NOT NULL CHECK (format_type IN ('balance_general', 'estado_resultados')),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(enterprise_id, format_type)
);

-- 3. Crear tabla de secciones de estados financieros
CREATE TABLE public.tab_financial_statement_sections (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  format_id bigint NOT NULL REFERENCES tab_financial_statement_formats(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  section_type text NOT NULL CHECK (section_type IN ('group', 'subtotal', 'total', 'calculated')),
  display_order integer NOT NULL,
  show_in_report boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 4. Crear tabla de cuentas por sección
CREATE TABLE public.tab_financial_statement_section_accounts (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  section_id bigint NOT NULL REFERENCES tab_financial_statement_sections(id) ON DELETE CASCADE,
  account_id bigint NOT NULL,
  display_order integer NOT NULL,
  sign_multiplier smallint DEFAULT 1 CHECK (sign_multiplier IN (1, -1)),
  include_children boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS en todas las tablas
ALTER TABLE public.tab_enterprise_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_financial_statement_formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_financial_statement_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_financial_statement_section_accounts ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para tab_enterprise_config
CREATE POLICY "Users can view their enterprise config"
ON public.tab_enterprise_config
FOR SELECT
USING (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert their enterprise config"
ON public.tab_enterprise_config
FOR INSERT
WITH CHECK (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update their enterprise config"
ON public.tab_enterprise_config
FOR UPDATE
USING (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete their enterprise config"
ON public.tab_enterprise_config
FOR DELETE
USING (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

-- Políticas RLS para tab_financial_statement_formats
CREATE POLICY "Users can view their formats"
ON public.tab_financial_statement_formats
FOR SELECT
USING (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert their formats"
ON public.tab_financial_statement_formats
FOR INSERT
WITH CHECK (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update their formats"
ON public.tab_financial_statement_formats
FOR UPDATE
USING (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete their formats"
ON public.tab_financial_statement_formats
FOR DELETE
USING (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
));

-- Políticas RLS para tab_financial_statement_sections (basadas en formato)
CREATE POLICY "Users can manage sections"
ON public.tab_financial_statement_sections
FOR ALL
USING (format_id IN (
  SELECT id FROM tab_financial_statement_formats WHERE enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
  )
));

-- Políticas RLS para tab_financial_statement_section_accounts (basadas en sección)
CREATE POLICY "Users can manage section accounts"
ON public.tab_financial_statement_section_accounts
FOR ALL
USING (section_id IN (
  SELECT id FROM tab_financial_statement_sections WHERE format_id IN (
    SELECT id FROM tab_financial_statement_formats WHERE enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
    )
  )
));

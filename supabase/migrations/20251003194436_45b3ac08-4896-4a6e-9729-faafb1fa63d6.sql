-- =====================================================
-- SISTEMA CONTABLE GUATEMALA - DATABASE SCHEMA
-- =====================================================

-- 1. USUARIOS Y EMPRESAS
-- =====================================================

CREATE TABLE tab_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  is_super_admin BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tab_enterprises (
  id BIGSERIAL PRIMARY KEY,
  nit TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  trade_name TEXT,
  tax_regime TEXT NOT NULL CHECK (tax_regime IN (
    'pequeño_contribuyente',
    'contribuyente_general', 
    'profesional_liberal',
    'exenta_ong'
  )),
  address TEXT,
  phone TEXT,
  email TEXT,
  fel_certificate_path TEXT,
  base_currency_code TEXT DEFAULT 'GTQ',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tab_user_enterprises (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES tab_users(id) ON DELETE CASCADE,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN (
    'admin_empresa',
    'contador',
    'auditor',
    'usuario_basico'
  )),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, enterprise_id)
);

-- 2. MONEDAS Y TIPOS DE CAMBIO
-- =====================================================

CREATE TABLE tab_currencies (
  id BIGSERIAL PRIMARY KEY,
  currency_code TEXT UNIQUE NOT NULL,
  currency_name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO tab_currencies (currency_code, currency_name, symbol) VALUES
  ('GTQ', 'Quetzal Guatemalteco', 'Q'),
  ('USD', 'Dólar Estadounidense', '$'),
  ('EUR', 'Euro', '€'),
  ('CAD', 'Dólar Canadiense', 'C$');

CREATE TABLE tab_exchange_rates (
  id BIGSERIAL PRIMARY KEY,
  currency_from_id BIGINT REFERENCES tab_currencies(id),
  currency_to_id BIGINT REFERENCES tab_currencies(id),
  rate DECIMAL(18,6) NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(currency_from_id, currency_to_id, effective_date)
);

-- 3. CATÁLOGO DE CUENTAS
-- =====================================================

CREATE TABLE tab_accounts (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN (
    'activo',
    'pasivo',
    'capital',
    'ingreso',
    'gasto',
    'costo'
  )),
  parent_account_id BIGINT REFERENCES tab_accounts(id),
  level INTEGER NOT NULL,
  is_detail_account BOOLEAN DEFAULT false,
  allows_movement BOOLEAN DEFAULT true,
  requires_cost_center BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, account_code)
);

CREATE INDEX idx_accounts_enterprise ON tab_accounts(enterprise_id);
CREATE INDEX idx_accounts_parent ON tab_accounts(parent_account_id);

-- 4. PERÍODOS CONTABLES
-- =====================================================

CREATE TABLE tab_accounting_periods (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'abierto' CHECK (status IN (
    'abierto',
    'cerrado',
    'en_proceso_cierre'
  )),
  closed_by UUID REFERENCES tab_users(id),
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, year)
);

-- 5. PARTIDAS CONTABLES (LIBRO DIARIO)
-- =====================================================

CREATE TABLE tab_journal_entries (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  accounting_period_id BIGINT REFERENCES tab_accounting_periods(id),
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'apertura',
    'diario',
    'ajuste',
    'cierre'
  )),
  document_reference TEXT,
  currency_id BIGINT REFERENCES tab_currencies(id),
  exchange_rate DECIMAL(18,6) DEFAULT 1,
  total_debit DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_credit DECIMAL(18,2) NOT NULL DEFAULT 0,
  is_balanced BOOLEAN GENERATED ALWAYS AS (total_debit = total_credit) STORED,
  is_posted BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES tab_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, entry_number)
);

CREATE TABLE tab_journal_entry_details (
  id BIGSERIAL PRIMARY KEY,
  journal_entry_id BIGINT REFERENCES tab_journal_entries(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  account_id BIGINT REFERENCES tab_accounts(id),
  debit_amount DECIMAL(18,2) DEFAULT 0,
  credit_amount DECIMAL(18,2) DEFAULT 0,
  description TEXT,
  cost_center TEXT,
  CHECK (debit_amount >= 0 AND credit_amount >= 0),
  CHECK (NOT (debit_amount > 0 AND credit_amount > 0))
);

CREATE INDEX idx_journal_entries_enterprise ON tab_journal_entries(enterprise_id);
CREATE INDEX idx_journal_entries_date ON tab_journal_entries(entry_date);
CREATE INDEX idx_journal_details_account ON tab_journal_entry_details(account_id);

-- 6. LIBRO DE COMPRAS (IVA)
-- =====================================================

CREATE TABLE tab_purchase_ledger (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  accounting_period_id BIGINT REFERENCES tab_accounting_periods(id),
  invoice_date DATE NOT NULL,
  invoice_series TEXT,
  invoice_number TEXT NOT NULL,
  authorization_number TEXT,
  fel_document_type TEXT,
  supplier_nit TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  purchase_type TEXT CHECK (purchase_type IN (
    'bien',
    'servicio',
    'importacion',
    'combustible',
    'pequeno_contribuyente'
  )),
  net_amount DECIMAL(18,2) NOT NULL,
  vat_amount DECIMAL(18,2) NOT NULL,
  total_amount DECIMAL(18,2) NOT NULL,
  currency_id BIGINT REFERENCES tab_currencies(id),
  exchange_rate DECIMAL(18,6) DEFAULT 1,
  journal_entry_id BIGINT REFERENCES tab_journal_entries(id),
  imported_from_fel BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_purchases_enterprise ON tab_purchase_ledger(enterprise_id);
CREATE INDEX idx_purchases_date ON tab_purchase_ledger(invoice_date);
CREATE INDEX idx_purchases_supplier ON tab_purchase_ledger(supplier_nit);

-- 7. LIBRO DE VENTAS (IVA)
-- =====================================================

CREATE TABLE tab_sales_ledger (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  accounting_period_id BIGINT REFERENCES tab_accounting_periods(id),
  invoice_date DATE NOT NULL,
  invoice_series TEXT,
  invoice_number TEXT NOT NULL,
  authorization_number TEXT NOT NULL,
  fel_document_type TEXT NOT NULL CHECK (fel_document_type IN (
    'FACT',
    'FCAM',
    'FPEQ',
    'NDEB',
    'NCRE',
    'RECI',
    'RDON'
  )),
  customer_nit TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  net_amount DECIMAL(18,2) NOT NULL,
  vat_amount DECIMAL(18,2) NOT NULL,
  total_amount DECIMAL(18,2) NOT NULL,
  currency_id BIGINT REFERENCES tab_currencies(id),
  exchange_rate DECIMAL(18,6) DEFAULT 1,
  journal_entry_id BIGINT REFERENCES tab_journal_entries(id),
  imported_from_fel BOOLEAN DEFAULT false,
  fel_xml_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sales_enterprise ON tab_sales_ledger(enterprise_id);
CREATE INDEX idx_sales_date ON tab_sales_ledger(invoice_date);
CREATE INDEX idx_sales_customer ON tab_sales_ledger(customer_nit);

-- 8. CONCILIACIÓN BANCARIA
-- =====================================================

CREATE TABLE tab_bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  account_id BIGINT REFERENCES tab_accounts(id),
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_type TEXT CHECK (account_type IN ('ahorro', 'monetaria', 'plazo')),
  currency_id BIGINT REFERENCES tab_currencies(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tab_bank_reconciliations (
  id BIGSERIAL PRIMARY KEY,
  bank_account_id BIGINT REFERENCES tab_bank_accounts(id),
  reconciliation_date DATE NOT NULL,
  bank_statement_balance DECIMAL(18,2) NOT NULL,
  book_balance DECIMAL(18,2) NOT NULL,
  adjustments DECIMAL(18,2) DEFAULT 0,
  reconciled_balance DECIMAL(18,2) NOT NULL,
  status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'conciliado')),
  notes TEXT,
  created_by UUID REFERENCES tab_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tab_bank_movements (
  id BIGSERIAL PRIMARY KEY,
  bank_account_id BIGINT REFERENCES tab_bank_accounts(id),
  movement_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference TEXT,
  debit_amount DECIMAL(18,2) DEFAULT 0,
  credit_amount DECIMAL(18,2) DEFAULT 0,
  balance DECIMAL(18,2),
  is_reconciled BOOLEAN DEFAULT false,
  reconciliation_id BIGINT REFERENCES tab_bank_reconciliations(id),
  journal_entry_id BIGINT REFERENCES tab_journal_entries(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. IMPORTACIÓN DE DATOS
-- =====================================================

CREATE TABLE tab_import_logs (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL CHECK (import_type IN (
    'cuentas_contables',
    'libro_compras',
    'libro_ventas',
    'fel_sat',
    'movimientos_bancarios'
  )),
  file_name TEXT NOT NULL,
  file_path TEXT,
  records_total INTEGER,
  records_imported INTEGER,
  records_failed INTEGER,
  status TEXT DEFAULT 'procesando' CHECK (status IN (
    'procesando',
    'completado',
    'completado_con_errores',
    'error'
  )),
  error_log JSONB,
  imported_by UUID REFERENCES tab_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. AUDITORÍA
-- =====================================================

CREATE TABLE tab_audit_log (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT REFERENCES tab_enterprises(id),
  user_id UUID REFERENCES tab_users(id),
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id BIGINT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_enterprise ON tab_audit_log(enterprise_id);
CREATE INDEX idx_audit_user ON tab_audit_log(user_id);
CREATE INDEX idx_audit_date ON tab_audit_log(created_at);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE tab_enterprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_user_enterprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_journal_entry_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_purchase_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_sales_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tab_import_logs ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios ven empresas a las que tienen acceso
CREATE POLICY user_enterprises_policy ON tab_enterprises
  FOR ALL
  USING (
    id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tab_users 
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Política: Datos visibles para usuarios de la empresa
CREATE POLICY enterprise_data_policy ON tab_accounts
  FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY enterprise_periods_policy ON tab_accounting_periods
  FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY enterprise_journal_policy ON tab_journal_entries
  FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY enterprise_purchases_policy ON tab_purchase_ledger
  FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY enterprise_sales_policy ON tab_sales_ledger
  FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY enterprise_bank_accounts_policy ON tab_bank_accounts
  FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY enterprise_imports_policy ON tab_import_logs
  FOR ALL
  USING (
    enterprise_id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY journal_details_policy ON tab_journal_entry_details
  FOR ALL
  USING (
    journal_entry_id IN (
      SELECT id FROM tab_journal_entries
      WHERE enterprise_id IN (
        SELECT enterprise_id FROM tab_user_enterprises 
        WHERE user_id = auth.uid()
      )
    )
  );

-- Trigger para sincronizar usuarios con auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.tab_users (id, email, full_name, is_super_admin, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    false,
    true
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
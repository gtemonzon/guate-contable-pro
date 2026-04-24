
-- ============================================================
-- SPRINT A: Conciliación Bancaria Cuadrática
-- ============================================================

CREATE TABLE public.tab_bank_reconciliation_quadratic (
  id BIGSERIAL PRIMARY KEY,
  reconciliation_id BIGINT NOT NULL REFERENCES public.tab_bank_reconciliations(id) ON DELETE CASCADE,
  enterprise_id BIGINT NOT NULL,
  bank_account_id BIGINT NOT NULL,
  initial_balance_bank NUMERIC NOT NULL DEFAULT 0,
  initial_balance_books NUMERIC NOT NULL DEFAULT 0,
  final_balance_bank NUMERIC NOT NULL DEFAULT 0,
  final_balance_books NUMERIC NOT NULL DEFAULT 0,
  total_income_bank NUMERIC NOT NULL DEFAULT 0,
  total_income_books NUMERIC NOT NULL DEFAULT 0,
  total_expenses_bank NUMERIC NOT NULL DEFAULT 0,
  total_expenses_books NUMERIC NOT NULL DEFAULT 0,
  auditor_name TEXT,
  auditor_colegiado_number TEXT,
  auditor_signature_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reconciliation_id)
);

CREATE INDEX idx_brq_enterprise ON public.tab_bank_reconciliation_quadratic(enterprise_id);
CREATE INDEX idx_brq_reconciliation ON public.tab_bank_reconciliation_quadratic(reconciliation_id);

ALTER TABLE public.tab_bank_reconciliation_quadratic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brq_select" ON public.tab_bank_reconciliation_quadratic
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "brq_insert" ON public.tab_bank_reconciliation_quadratic
  FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "brq_update" ON public.tab_bank_reconciliation_quadratic
  FOR UPDATE USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "brq_no_delete" ON public.tab_bank_reconciliation_quadratic
  FOR DELETE USING (false);

CREATE TABLE public.tab_bank_reconciliation_adjustments (
  id BIGSERIAL PRIMARY KEY,
  reconciliation_id BIGINT NOT NULL REFERENCES public.tab_bank_reconciliations(id) ON DELETE CASCADE,
  enterprise_id BIGINT NOT NULL,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('cheque_no_cobrado','deposito_en_transito','nota_debito_banco','nota_credito_banco','error_banco','error_libros','otro')),
  affects_side TEXT NOT NULL CHECK (affects_side IN ('banco','libros')),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  document_reference TEXT,
  adjustment_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid()
);

CREATE INDEX idx_bra_reconciliation ON public.tab_bank_reconciliation_adjustments(reconciliation_id);
CREATE INDEX idx_bra_enterprise ON public.tab_bank_reconciliation_adjustments(enterprise_id);

ALTER TABLE public.tab_bank_reconciliation_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bra_select" ON public.tab_bank_reconciliation_adjustments
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "bra_insert" ON public.tab_bank_reconciliation_adjustments
  FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "bra_update" ON public.tab_bank_reconciliation_adjustments
  FOR UPDATE USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "bra_delete" ON public.tab_bank_reconciliation_adjustments
  FOR DELETE USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

ALTER TABLE public.tab_enterprise_config
  ADD COLUMN IF NOT EXISTS default_auditor_name TEXT,
  ADD COLUMN IF NOT EXISTS default_auditor_colegiado TEXT;

-- ============================================================
-- SPRINT C: Nómina
-- ============================================================

CREATE TABLE public.tab_payroll_periods (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  payment_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','imported','posted','reversed')),
  journal_entry_id BIGINT,
  total_gross NUMERIC NOT NULL DEFAULT 0,
  total_deductions NUMERIC NOT NULL DEFAULT 0,
  total_net NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID DEFAULT auth.uid(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(enterprise_id, period_year, period_month)
);

CREATE INDEX idx_payroll_periods_enterprise ON public.tab_payroll_periods(enterprise_id);

ALTER TABLE public.tab_payroll_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_periods_select" ON public.tab_payroll_periods
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "payroll_periods_insert" ON public.tab_payroll_periods
  FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "payroll_periods_update" ON public.tab_payroll_periods
  FOR UPDATE USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "payroll_periods_delete" ON public.tab_payroll_periods
  FOR DELETE USING ((is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id)) AND status = 'draft');

CREATE TABLE public.tab_payroll_entries (
  id BIGSERIAL PRIMARY KEY,
  payroll_period_id BIGINT NOT NULL REFERENCES public.tab_payroll_periods(id) ON DELETE CASCADE,
  enterprise_id BIGINT NOT NULL,
  employee_dpi TEXT,
  employee_name TEXT NOT NULL,
  employee_position TEXT,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  bonificacion_decreto NUMERIC NOT NULL DEFAULT 0,
  overtime NUMERIC NOT NULL DEFAULT 0,
  commissions NUMERIC NOT NULL DEFAULT 0,
  other_income NUMERIC NOT NULL DEFAULT 0,
  igss_laboral NUMERIC NOT NULL DEFAULT 0,
  isr_retained NUMERIC NOT NULL DEFAULT 0,
  loans_deduction NUMERIC NOT NULL DEFAULT 0,
  other_deductions NUMERIC NOT NULL DEFAULT 0,
  net_pay NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payroll_entries_period ON public.tab_payroll_entries(payroll_period_id);
CREATE INDEX idx_payroll_entries_enterprise ON public.tab_payroll_entries(enterprise_id);

ALTER TABLE public.tab_payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_entries_select" ON public.tab_payroll_entries
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "payroll_entries_insert" ON public.tab_payroll_entries
  FOR INSERT WITH CHECK (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "payroll_entries_update" ON public.tab_payroll_entries
  FOR UPDATE USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));
CREATE POLICY "payroll_entries_delete" ON public.tab_payroll_entries
  FOR DELETE USING (is_super_admin(auth.uid()) OR user_is_linked_to_enterprise(auth.uid(), enterprise_id));

-- 12 cuentas de nómina en config de empresa
ALTER TABLE public.tab_enterprise_config
  ADD COLUMN IF NOT EXISTS payroll_salaries_expense_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_bonificacion_expense_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_igss_patronal_expense_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_indemnizacion_expense_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_aguinaldo_expense_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_bono14_expense_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_vacaciones_expense_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_igss_payable_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_isr_payable_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_salaries_payable_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_indemnizacion_provision_account_id BIGINT,
  ADD COLUMN IF NOT EXISTS payroll_aguinaldo_bono14_provision_account_id BIGINT;

-- Trigger updated_at
CREATE TRIGGER trg_brq_updated_at
  BEFORE UPDATE ON public.tab_bank_reconciliation_quadratic
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_payroll_periods_updated_at
  BEFORE UPDATE ON public.tab_payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

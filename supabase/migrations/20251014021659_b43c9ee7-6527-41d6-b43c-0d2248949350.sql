-- Add classification fields to tab_accounts for income statement
ALTER TABLE public.tab_accounts 
ADD COLUMN IF NOT EXISTS is_income_account boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_cost_account boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_expense_account boolean DEFAULT false;

COMMENT ON COLUMN public.tab_accounts.is_income_account IS 'Indica si es cuenta de ingreso para Estado de Resultados';
COMMENT ON COLUMN public.tab_accounts.is_cost_account IS 'Indica si es cuenta de costo para Estado de Resultados';
COMMENT ON COLUMN public.tab_accounts.is_expense_account IS 'Indica si es cuenta de gasto para Estado de Resultados';
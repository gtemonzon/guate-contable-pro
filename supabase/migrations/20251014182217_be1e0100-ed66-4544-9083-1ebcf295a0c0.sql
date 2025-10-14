-- Eliminar columnas innecesarias de tab_accounts
ALTER TABLE public.tab_accounts 
DROP COLUMN IF EXISTS is_detail_account,
DROP COLUMN IF EXISTS is_income_account,
DROP COLUMN IF EXISTS is_cost_account,
DROP COLUMN IF EXISTS is_expense_account;
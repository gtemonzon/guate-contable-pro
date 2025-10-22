-- Migración: Agregar campos de cuenta contable y banco a tab_purchase_ledger y tab_sales_ledger

-- Agregar campos a tab_purchase_ledger
ALTER TABLE public.tab_purchase_ledger 
ADD COLUMN IF NOT EXISTS expense_account_id bigint REFERENCES public.tab_accounts(id),
ADD COLUMN IF NOT EXISTS bank_account_id bigint REFERENCES public.tab_accounts(id);

COMMENT ON COLUMN public.tab_purchase_ledger.expense_account_id IS 
'Cuenta contable donde se registrará el gasto/compra (debe permitir movimientos)';

COMMENT ON COLUMN public.tab_purchase_ledger.bank_account_id IS 
'Cuenta bancaria para el pago cuando existe batch_reference (debe ser cuenta bancaria)';

-- Agregar campo a tab_sales_ledger
ALTER TABLE public.tab_sales_ledger 
ADD COLUMN IF NOT EXISTS income_account_id bigint REFERENCES public.tab_accounts(id);

COMMENT ON COLUMN public.tab_sales_ledger.income_account_id IS 
'Cuenta contable donde se registrará el ingreso/venta (debe permitir movimientos)';
-- Agregar campo de tipo de saldo a la tabla de cuentas
ALTER TABLE public.tab_accounts 
ADD COLUMN balance_type text DEFAULT 'deudor' CHECK (balance_type IN ('deudor', 'acreedor'));

COMMENT ON COLUMN public.tab_accounts.balance_type IS 'Tipo de saldo natural de la cuenta: deudor (activo, gastos, costos) o acreedor (pasivo, capital, ingresos)';
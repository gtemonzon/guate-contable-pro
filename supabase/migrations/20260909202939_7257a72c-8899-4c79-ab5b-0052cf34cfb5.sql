-- Cuenta de gasto para el impuesto fijo de Pequeño Contribuyente (5% sobre
-- ingresos brutos), usada al contabilizar la póliza de Libro de Ventas.
ALTER TABLE public.tab_enterprise_config ADD COLUMN small_taxpayer_tax_expense_account_id bigint;

-- Eliminar la restricción existente
ALTER TABLE public.tab_accounts DROP CONSTRAINT IF EXISTS tab_accounts_balance_type_check;

-- Crear nueva restricción que incluya 'indiferente'
ALTER TABLE public.tab_accounts ADD CONSTRAINT tab_accounts_balance_type_check 
CHECK (balance_type IN ('deudor', 'acreedor', 'indiferente'));
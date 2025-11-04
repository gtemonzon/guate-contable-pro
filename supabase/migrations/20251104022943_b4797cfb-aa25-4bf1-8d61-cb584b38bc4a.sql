-- Agregar campo para período activo por defecto
ALTER TABLE public.tab_accounting_periods 
ADD COLUMN is_default_period boolean DEFAULT false;

COMMENT ON COLUMN public.tab_accounting_periods.is_default_period IS 
'Indica si este es el período activo por defecto para la empresa';
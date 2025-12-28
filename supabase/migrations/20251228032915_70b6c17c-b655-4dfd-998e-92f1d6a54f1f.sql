-- Update the validate_sales_invoice_date trigger to validate dates within the full period range
CREATE OR REPLACE FUNCTION public.validate_sales_invoice_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  period_start_date date;
  period_end_date date;
  period_status text;
BEGIN
  -- Si no hay accounting_period_id, no validar (permitir NULL)
  IF NEW.accounting_period_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Obtener el período contable asociado a la venta
  SELECT start_date, end_date, status 
  INTO period_start_date, period_end_date, period_status
  FROM public.tab_accounting_periods
  WHERE id = NEW.accounting_period_id;
  
  -- Si no se encuentra el período, rechazar
  IF period_start_date IS NULL THEN
    RAISE EXCEPTION 'No se encontró el período contable asociado';
  END IF;
  
  -- Verificar que el período esté abierto
  IF period_status != 'abierto' THEN
    RAISE EXCEPTION 'El período contable está cerrado';
  END IF;
  
  -- Validar que la fecha de la factura esté DENTRO del rango del período (no solo el mes)
  IF NEW.invoice_date < period_start_date OR NEW.invoice_date > period_end_date THEN
    RAISE EXCEPTION 'La fecha de la factura (%) debe estar dentro del período contable (% a %)', 
      NEW.invoice_date, period_start_date, period_end_date;
  END IF;
  
  RETURN NEW;
END;
$function$;
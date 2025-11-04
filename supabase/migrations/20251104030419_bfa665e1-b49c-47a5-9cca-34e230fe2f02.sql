-- Hacer el trigger de validación más flexible para ventas
-- Permitir que busque el período contable basado en la fecha de factura
DROP TRIGGER IF EXISTS validate_sales_invoice_date_trigger ON public.tab_sales_ledger;

CREATE OR REPLACE FUNCTION public.validate_sales_invoice_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  period_start_date date;
  period_end_date date;
  period_status text;
  invoice_month integer;
  invoice_year integer;
  period_month integer;
  period_year integer;
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
  
  -- Extraer mes y año de la fecha de factura
  invoice_month := EXTRACT(MONTH FROM NEW.invoice_date);
  invoice_year := EXTRACT(YEAR FROM NEW.invoice_date);
  
  -- Extraer mes y año del inicio del período
  period_month := EXTRACT(MONTH FROM period_start_date);
  period_year := EXTRACT(YEAR FROM period_start_date);
  
  -- Validar que la fecha de la factura esté en el mismo mes y año del período
  IF invoice_month != period_month OR invoice_year != period_year THEN
    RAISE EXCEPTION 'La fecha de la factura debe estar dentro del mes seleccionado (% %)', 
      TO_CHAR(period_start_date, 'Month'), period_year;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Recrear el trigger
CREATE TRIGGER validate_sales_invoice_date_trigger
  BEFORE INSERT OR UPDATE ON public.tab_sales_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sales_invoice_date();
-- Actualizar función de validación de fechas de ventas
-- Para validar contra el período contable en lugar de la fecha actual

CREATE OR REPLACE FUNCTION public.validate_sales_invoice_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  period_start_date date;
  period_end_date date;
  period_status text;
BEGIN
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
  
  -- Validar que la fecha de la factura esté dentro del período contable
  -- Permitir hasta 2 meses antes del inicio del período (para facturas atrasadas)
  IF NEW.invoice_date < (period_start_date - interval '2 months')::date OR 
     NEW.invoice_date > period_end_date THEN
    RAISE EXCEPTION 'La fecha de la factura debe estar dentro del período contable o máximo 2 meses antes';
  END IF;
  
  RETURN NEW;
END;
$$;
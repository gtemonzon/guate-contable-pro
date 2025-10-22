-- 1. Agregar campo applies_vat a tab_fel_document_types
ALTER TABLE public.tab_fel_document_types 
ADD COLUMN applies_vat boolean NOT NULL DEFAULT true;

-- Actualizar tipos de documentos que NO aplican IVA
UPDATE public.tab_fel_document_types 
SET applies_vat = false 
WHERE code IN ('PEQC', 'RDON', 'FPEQ') 
   OR name ILIKE '%pequeño contribuyente%' 
   OR name ILIKE '%donación%'
   OR name ILIKE '%pequeña%';

-- 2. Agregar función para validar rango de fechas en libros (mes actual o máximo 2 meses atrás)
CREATE OR REPLACE FUNCTION public.validate_invoice_date(
  invoice_date date,
  book_month integer,
  book_year integer
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  min_date date;
  max_date date;
  invoice_month_start date;
BEGIN
  -- Fecha mínima: primer día de 2 meses antes del mes del libro
  min_date := date_trunc('month', make_date(book_year, book_month, 1) - interval '2 months');
  
  -- Fecha máxima: último día del mes del libro
  max_date := (date_trunc('month', make_date(book_year, book_month, 1)) + interval '1 month - 1 day')::date;
  
  -- Verificar que la fecha esté en el rango permitido
  RETURN invoice_date >= min_date AND invoice_date <= max_date;
END;
$$;

-- 3. Agregar trigger para validar fechas en tab_purchase_ledger
CREATE OR REPLACE FUNCTION public.validate_purchase_invoice_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  book_month integer;
  book_year integer;
BEGIN
  -- Obtener mes y año del libro
  SELECT month, year INTO book_month, book_year
  FROM public.tab_purchase_books
  WHERE id = NEW.purchase_book_id;
  
  -- Validar fecha
  IF NOT validate_invoice_date(NEW.invoice_date, book_month, book_year) THEN
    RAISE EXCEPTION 'La fecha de la factura debe estar en el mes seleccionado o máximo 2 meses atrás';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_purchase_invoice_date ON public.tab_purchase_ledger;
CREATE TRIGGER check_purchase_invoice_date
  BEFORE INSERT OR UPDATE ON public.tab_purchase_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_purchase_invoice_date();

-- 4. Agregar trigger similar para tab_sales_ledger
CREATE OR REPLACE FUNCTION public.validate_sales_invoice_date()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_month integer;
  invoice_year integer;
  min_date date;
  max_date date;
BEGIN
  -- Extraer mes y año de la fecha de factura
  invoice_month := EXTRACT(MONTH FROM NEW.invoice_date);
  invoice_year := EXTRACT(YEAR FROM NEW.invoice_date);
  
  -- Para ventas, validar que esté en un rango razonable (mes actual o 2 meses atrás desde hoy)
  min_date := date_trunc('month', CURRENT_DATE - interval '2 months');
  max_date := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
  
  IF NEW.invoice_date < min_date OR NEW.invoice_date > max_date THEN
    RAISE EXCEPTION 'La fecha de la factura debe estar en el mes actual o máximo 2 meses atrás';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_sales_invoice_date ON public.tab_sales_ledger;
CREATE TRIGGER check_sales_invoice_date
  BEFORE INSERT OR UPDATE ON public.tab_sales_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sales_invoice_date();
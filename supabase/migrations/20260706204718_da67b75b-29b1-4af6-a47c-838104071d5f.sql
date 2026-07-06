CREATE OR REPLACE FUNCTION public.validate_purchase_invoice_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  book_month integer;
  book_year integer;
  min_date date;
  max_date date;
BEGIN
  SELECT month, year INTO book_month, book_year
  FROM public.tab_purchase_books
  WHERE id = NEW.purchase_book_id;

  IF book_month IS NULL OR book_year IS NULL THEN
    RAISE EXCEPTION 'No se encontró el libro de compras asociado (id=%).', NEW.purchase_book_id;
  END IF;

  min_date := date_trunc('month', make_date(book_year, book_month, 1) - interval '2 months')::date;
  max_date := (date_trunc('month', make_date(book_year, book_month, 1)) + interval '1 month - 1 day')::date;

  IF NEW.invoice_date < min_date OR NEW.invoice_date > max_date THEN
    RAISE EXCEPTION 'La fecha de la factura (%) debe estar entre % y % (libro seleccionado: %/%).',
      NEW.invoice_date, min_date, max_date, book_month, book_year;
  END IF;

  RETURN NEW;
END;
$function$;
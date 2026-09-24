-- Entrega B — Borrado lógico en los libros fiscales (tab_purchase_ledger / tab_sales_ledger)
--
-- Se aplica manualmente vía MCP ANTES de publicar el frontend (Lovable no ejecuta
-- migraciones subidas por GitHub) y se registra en supabase_migrations.schema_migrations.
-- Idempotente: se puede ejecutar más de una vez.
--
-- Las funciones de esta migración se reconstruyeron a partir de su última versión
-- en el repo. Antes de aplicar, comparar con la definición viva:
--   SELECT pg_get_functiondef('public.get_book_summaries_latest(integer)'::regprocedure);
--   SELECT pg_get_functiondef('public.validate_purchase_invoice_date'::regproc);
--   SELECT pg_get_functiondef('public.validate_sales_invoice_date'::regproc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.1 Índices únicos conscientes del borrado lógico
--
-- Con borrado lógico la fila permanece en la tabla; sin predicado, estos índices
-- impedirían volver a ingresar una factura borrada. Se conservan exactamente los
-- nombres unique_purchase_document / unique_sales_document porque LibrosFiscales.tsx
-- los busca en el mensaje de error para mostrar "Documento ya ingresado".
--
-- Se sueltan según lo que realmente sean (constraint o índice suelto) y solo si
-- todavía no son parciales, para que re-ejecutar la migración no haga nada.
-- Crear los índices parciales no puede fallar por datos existentes: hoy ninguna
-- fila tiene deleted_at, y las versiones sin predicado ya garantizaban unicidad.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_name  text;
  v_table text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['unique_purchase_document', 'unique_sales_document'] LOOP
    v_table := CASE v_name WHEN 'unique_purchase_document' THEN 'tab_purchase_ledger'
                           ELSE 'tab_sales_ledger' END;

    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = v_name AND conrelid = format('public.%I', v_table)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_name);
    ELSIF EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = v_name
        AND indexdef NOT ILIKE '%WHERE%deleted_at IS NULL%'
    ) THEN
      EXECUTE format('DROP INDEX public.%I', v_name);
    END IF;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS unique_purchase_document
  ON public.tab_purchase_ledger
  (supplier_nit, fel_document_type, invoice_series, invoice_number, purchase_book_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_sales_document
  ON public.tab_sales_ledger
  (fel_document_type, COALESCE(invoice_series, ''::text), invoice_number,
   enterprise_id, EXTRACT(month FROM invoice_date), EXTRACT(year FROM invoice_date))
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.2 get_book_summaries_latest (tarjetas del Dashboard)
-- Única diferencia con la versión vigente (20260508152944): la rama de ventas
-- ahora filtra deleted_at IS NULL, igual que la de compras.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_book_summaries_latest(p_enterprise_id integer)
RETURNS TABLE (
  ledger text,
  year   integer,
  month  integer,
  base   numeric,
  vat    numeric,
  total  numeric,
  cnt    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _auth AS (
    SELECT public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises ue
      WHERE ue.user_id = auth.uid() AND ue.enterprise_id = p_enterprise_id
    ) AS allowed
  ),
  purchases AS (
    SELECT 'purchases'::text AS ledger,
           EXTRACT(YEAR  FROM invoice_date)::int AS year,
           EXTRACT(MONTH FROM invoice_date)::int AS month,
           COALESCE(SUM(net_amount),   0)::numeric AS base,
           COALESCE(SUM(vat_amount),   0)::numeric AS vat,
           COALESCE(SUM(total_amount), 0)::numeric AS total,
           COUNT(*)::int AS cnt
    FROM public.tab_purchase_ledger
    WHERE enterprise_id = p_enterprise_id
      AND deleted_at IS NULL
      AND (SELECT allowed FROM _auth)
    GROUP BY 2, 3
    ORDER BY year DESC, month DESC
    LIMIT 2
  ),
  sales AS (
    SELECT 'sales'::text AS ledger,
           EXTRACT(YEAR  FROM invoice_date)::int AS year,
           EXTRACT(MONTH FROM invoice_date)::int AS month,
           COALESCE(SUM(net_amount),   0)::numeric AS base,
           COALESCE(SUM(vat_amount),   0)::numeric AS vat,
           COALESCE(SUM(total_amount), 0)::numeric AS total,
           COUNT(*)::int AS cnt
    FROM public.tab_sales_ledger
    WHERE enterprise_id = p_enterprise_id
      AND is_annulled = false
      AND deleted_at IS NULL
      AND (SELECT allowed FROM _auth)
    GROUP BY 2, 3
    ORDER BY year DESC, month DESC
    LIMIT 2
  )
  SELECT * FROM purchases
  UNION ALL
  SELECT * FROM sales;
$$;

GRANT EXECUTE ON FUNCTION public.get_book_summaries_latest(integer) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Adicional (no estaba en las instrucciones): validadores de fecha/período
--
-- validate_purchase_invoice_date y validate_sales_invoice_date corren en BEFORE
-- INSERT OR UPDATE. El borrado físico no pasaba por ellos; el lógico (UPDATE) sí.
-- Sin este ajuste, borrar una venta de un período cerrado, o una compra cuya fecha
-- quedó fuera de la ventana del libro o sin libro asociado, fallaría con
-- "El período contable está cerrado" / "La fecha de la factura ... debe estar...".
-- Única diferencia con las versiones vigentes (20260706204718 y 20251228032915):
-- el retorno temprano cuando el UPDATE es exactamente la transición a borrado.
-- Si se prefiere BLOQUEAR el borrado en períodos cerrados, omitir esta sección.
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Borrado lógico (Entrega B): marcar deleted_at no es una captura ni una
  -- edición de la factura, así que no se revalida fecha/período. Conserva el
  -- comportamiento previo, en el que el borrado físico (DELETE) no pasaba por
  -- este trigger. Cualquier otro UPDATE se valida exactamente igual que antes.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

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
  -- Borrado lógico (Entrega B): marcar deleted_at no es una captura ni una
  -- edición de la factura, así que no se revalida fecha/período. Conserva el
  -- comportamiento previo, en el que el borrado físico (DELETE) no pasaba por
  -- este trigger. Cualquier otro UPDATE se valida exactamente igual que antes.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

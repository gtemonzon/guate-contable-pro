-- Entrega A — Trazabilidad de los libros fiscales (tab_purchase_ledger / tab_sales_ledger)
--
-- Puramente aditiva: no cambia captura, edición ni borrado. El borrado lógico
-- (uso de deleted_at/deleted_by) es la Entrega B.
--
-- Idempotente. Lovable no ejecuta migraciones subidas por GitHub: se aplica
-- manualmente vía MCP y se registra en supabase_migrations.schema_migrations.

-- 1.1 Columnas de autoría. SIN backfill: las filas existentes quedan en NULL
-- (inventar autoría sería peor que no tenerla).
ALTER TABLE public.tab_purchase_ledger
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

ALTER TABLE public.tab_sales_ledger
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id);

-- 1.3 audit_trigger_function(): misma lógica que la versión vigente
-- (20260507065004 — guard de app.import_mode, manejo de undefined_column,
-- returns), con una única adición: para los dos libros fiscales no se excluyen
-- deleted_at/deleted_by de la comparación de UPDATE. Se define antes de crear
-- los triggers para que nunca corran con la versión anterior.
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_enterprise_id bigint;
  v_old_data jsonb;
  v_new_data jsonb;
  v_record_id bigint;
  v_excluded_columns text[] := ARRAY[
    'last_activity_at',
    'last_activity',
    'updated_at',
    'updated_by',
    'created_at',
    'created_by',
    'reviewed_at',
    'reviewed_by',
    'posted_at',
    'closed_at',
    'closed_by',
    'deleted_at',
    'deleted_by',
    'read_at',
    'uploaded_at',
    'uploaded_by',
    'current_enterprise_name',
    'modified_by',
    'user_modified'
  ];
  v_old_filtered jsonb;
  v_new_filtered jsonb;
  v_col text;
BEGIN
  -- Solo para los libros fiscales: deleted_at/deleted_by SÍ cuentan como cambio,
  -- para que el borrado lógico (Entrega B) quede registrado en la bitácora.
  -- tab_accounts, tab_journal_entries y demás tablas conservan la exclusión.
  IF TG_TABLE_NAME IN ('tab_purchase_ledger', 'tab_sales_ledger') THEN
    v_excluded_columns := array_remove(v_excluded_columns, 'deleted_at');
    v_excluded_columns := array_remove(v_excluded_columns, 'deleted_by');
  END IF;

  IF current_setting('app.import_mode', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_enterprise_id := OLD.enterprise_id;
      v_record_id := OLD.id;
    ELSE
      v_enterprise_id := NEW.enterprise_id;
      v_record_id := NEW.id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    v_enterprise_id := NULL;
    IF TG_OP = 'DELETE' THEN
      v_record_id := OLD.id;
    ELSE
      v_record_id := NEW.id;
    END IF;
  END;

  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);

    v_old_filtered := v_old_data;
    v_new_filtered := v_new_data;

    FOREACH v_col IN ARRAY v_excluded_columns LOOP
      v_old_filtered := v_old_filtered - v_col;
      v_new_filtered := v_new_filtered - v_col;
    END LOOP;

    IF v_old_filtered = v_new_filtered THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.tab_audit_log (
    enterprise_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    v_enterprise_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1.2 Triggers de auditoría — SOLO UPDATE y DELETE.
-- Sin INSERT: el importador de legado inserta decenas de miles de filas desde
-- el navegador (supabase-js no puede activar app.import_mode) y llenaría
-- tab_audit_log. La creación queda cubierta por created_by + created_at.
DROP TRIGGER IF EXISTS audit_purchase_ledger ON public.tab_purchase_ledger;
CREATE TRIGGER audit_purchase_ledger
  AFTER UPDATE OR DELETE ON public.tab_purchase_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

DROP TRIGGER IF EXISTS audit_sales_ledger ON public.tab_sales_ledger;
CREATE TRIGGER audit_sales_ledger
  AFTER UPDATE OR DELETE ON public.tab_sales_ledger
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- 1.4 RPC para el filtro "Entidad" de la Bitácora. NO es SECURITY DEFINER:
-- la RLS de tab_audit_log (empresas del usuario) debe seguir aplicando.
CREATE OR REPLACE FUNCTION public.get_audited_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT DISTINCT a.table_name
  FROM public.tab_audit_log a
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_audited_tables() TO authenticated;

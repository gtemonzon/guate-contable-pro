-- Purga de tab_audit_log: cambiar retención de 12 a 36 meses y automatizar
-- con pg_cron. Tras la optimización anterior, tab_audit_log quedó en ~110 MB
-- / ~84,000 filas y ya no recibe los eventos de alto volumen de los libros
-- fiscales — conservar 3 ejercicios fiscales completos es holgado en espacio
-- y más útil que 12 meses.

-- Recreada (DROP + CREATE, no CREATE OR REPLACE, porque cambia el nombre de
-- la columna de salida remaining_older_than_12mo -> remaining_older_than_36mo,
-- algo que CREATE OR REPLACE no permite sobre un OUT parameter existente).
-- Mismo manejo por lotes con ctid y el mismo clamp de p_batch_size — solo
-- cambia el intervalo de retención (las dos apariciones de '12 months').
DROP FUNCTION IF EXISTS public.purge_old_audit_log(integer);

CREATE FUNCTION public.purge_old_audit_log(p_batch_size integer DEFAULT 50000)
 RETURNS TABLE(deleted_count bigint, remaining_older_than_36mo bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted bigint := 0;
BEGIN
  DELETE FROM public.tab_audit_log
  WHERE ctid IN (
    SELECT ctid FROM public.tab_audit_log
    WHERE created_at < now() - interval '36 months'
    LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 50000), 200000))
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY
  SELECT v_deleted,
         (SELECT count(*) FROM public.tab_audit_log WHERE created_at < now() - interval '36 months');
END;
$function$;

-- purge_old_audit_log borra un solo lote (hasta p_batch_size filas) por
-- invocación. Con una ejecución mensual de un solo lote, un backlog mayor a
-- p_batch_size nunca terminaría de drenarse. Se resuelve con la opción (a):
-- una función envolvente que llama a purge_old_audit_log en bucle hasta que
-- no quede nada pendiente, con un tope de seguridad de 50 iteraciones para
-- no colgar el job de cron. Dado el volumen real (~84,000 filas totales, y
-- con 36 meses de retención probablemente cero filas purgables durante los
-- próximos ~2 años), esta opción es más limpia que aumentar la frecuencia
-- del job y no genera carga innecesaria.
CREATE OR REPLACE FUNCTION public.run_audit_log_purge()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted bigint;
  v_remaining bigint;
  v_total_deleted bigint := 0;
  v_iterations integer := 0;
  v_max_iterations CONSTANT integer := 50;
BEGIN
  LOOP
    SELECT deleted_count, remaining_older_than_36mo
      INTO v_deleted, v_remaining
      FROM public.purge_old_audit_log(50000);

    v_total_deleted := v_total_deleted + v_deleted;
    v_iterations := v_iterations + 1;

    EXIT WHEN v_remaining = 0 OR v_iterations >= v_max_iterations;
  END LOOP;

  RETURN jsonb_build_object(
    'total_deleted', v_total_deleted,
    'iterations', v_iterations,
    'remaining_older_than_36mo', v_remaining,
    'hit_iteration_cap', v_iterations >= v_max_iterations AND v_remaining > 0
  );
END;
$function$;

-- pg_cron SÍ está disponible en este proyecto Supabase (confirmado con
-- pg_available_extensions antes de este cambio: versión 1.6.4,
-- installed_version = null). Se activa y se programa la purga mensual, de
-- madrugada del primer día de cada mes (horario de baja actividad).
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- cron.schedule con nombre fijo es idempotente: si ya existiera un job con
-- este nombre, lo reemplaza en vez de duplicarlo.
SELECT cron.schedule(
  'purge-audit-log-monthly',
  '0 3 1 * *',
  $$SELECT public.run_audit_log_purge()$$
);

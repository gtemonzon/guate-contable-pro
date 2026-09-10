-- Optimización crítica de auditoría (Fase 3): podar tab_audit_log
-- tab_audit_log se conserva como log convencional (mutable, sin hash), pero
-- acotado: se quitan sus triggers en las tablas de alto volumen que no aportan
-- valor de auditoría real (los libros fiscales ya tienen su rastro vía las
-- partidas contables y tab_journal_entry_history). Se conservan los triggers
-- de bajo volumen que sí responden a "quién hizo qué" en lo que importa.
DROP TRIGGER IF EXISTS audit_purchase_ledger ON tab_purchase_ledger;
DROP TRIGGER IF EXISTS audit_sales_ledger ON tab_sales_ledger;

-- Purga ejecutada en producción (fuera de esta migración, por lotes de
-- ctid, verificando el conteo real con pg_stat_user_tables/COUNT
-- independiente después de cada lote — nunca confiando en si la llamada
-- reportó éxito o timeout): eliminadas todas las filas de tab_audit_log con
-- table_name IN ('tab_purchase_ledger','tab_sales_ledger') — 1,455,146 ->
-- 84,439 filas (94.2% de reducción). No había filas con más de 12 meses de
-- antigüedad (el sistema solo tiene datos desde 2026-01-30). Se ejecutó
-- VACUUM FULL tab_audit_log al terminar para devolver el espacio en disco
-- (2043 MB -> 110 MB).

-- Función de purga para mantener acotado el crecimiento futuro. pg_cron NO
-- está instalado en este proyecto Supabase (verificado con
-- SELECT * FROM pg_extension WHERE extname = 'pg_cron' -> sin resultados),
-- así que esta función NO queda programada automáticamente — debe
-- ejecutarse manualmente (documentado en CLAUDE.md).
CREATE OR REPLACE FUNCTION public.purge_old_audit_log(p_batch_size integer DEFAULT 50000)
 RETURNS TABLE(deleted_count bigint, remaining_older_than_12mo bigint)
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
    WHERE created_at < now() - interval '12 months'
    LIMIT GREATEST(1, LEAST(COALESCE(p_batch_size, 50000), 200000))
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY
  SELECT v_deleted,
         (SELECT count(*) FROM public.tab_audit_log WHERE created_at < now() - interval '12 months');
END;
$function$;

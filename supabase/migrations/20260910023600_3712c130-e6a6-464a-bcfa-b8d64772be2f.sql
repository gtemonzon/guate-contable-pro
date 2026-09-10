-- Optimización crítica de auditoría (Fases 1 y 2): audit_event_log + tab_audit_log
-- eran el 96% del tamaño de la base de datos (2886 MB / 1,591,577 filas y 2043 MB /
-- 1,455,146 filas respectivamente, sobre ~5108 MB totales). audit_event_log
-- duplicaba tab_audit_log en 6 tablas centrales, guardaba la fila completa en JSON
-- (antes y después) en cada cambio, y su hash encadenado no responde a ninguna
-- exigencia legal (decisión de diseño, nunca consultado). El historial real que se
-- usa (partidas contables) vive en tab_journal_entry_history, que no se toca aquí.
--
-- Fase 1: detener el crecimiento — quitar los 9 triggers de auditoría de doble
-- registro en las tablas de alto volumen (audit_event_log_trigger).
DROP TRIGGER IF EXISTS trg_audit_journal_details ON tab_journal_entry_details;
DROP TRIGGER IF EXISTS trg_audit_purchase_ledger ON tab_purchase_ledger;
DROP TRIGGER IF EXISTS trg_audit_sales_ledger ON tab_sales_ledger;
DROP TRIGGER IF EXISTS trg_audit_purchase_books ON tab_purchase_books;
DROP TRIGGER IF EXISTS audit_purchase_journal_links ON tab_purchase_journal_links;
DROP TRIGGER IF EXISTS trg_audit_journal_entries ON tab_journal_entries;
DROP TRIGGER IF EXISTS trg_audit_accounts ON tab_accounts;
DROP TRIGGER IF EXISTS trg_audit_periods ON tab_accounting_periods;
DROP TRIGGER IF EXISTS trg_audit_enterprises ON tab_enterprises;

-- Fase 2: eliminar audit_event_log por completo. Verificado antes del DROP: sin
-- vistas dependientes; solo su propia PK y un FK saliente a auth.users (ambos
-- desaparecen con la tabla). Se desactiva primero el trigger de inmutabilidad
-- (BEFORE DELETE incondicional, no respeta app.import_mode).
ALTER TABLE audit_event_log DISABLE TRIGGER trg_block_audit_event_log_delete;
DROP TABLE audit_event_log CASCADE;

-- Funciones cuya única razón de existir era audit_event_log:
-- - audit_event_log_trigger: la función de trigger real (no estaba en la lista
--   original de funciones a revisar, encontrada al buscar qué disparaba los 9
--   triggers de la Fase 1) — llama a write_audit_event.
-- - write_audit_event: arma el hash encadenado e inserta en audit_event_log.
-- - block_audit_event_log_mutations: bloqueaba UPDATE/DELETE sobre la tabla.
-- - verify_audit_chain: verificaba la integridad del hash encadenado — sin
--   consumidores reales en el frontend (solo aparecía en el tipo generado de
--   Supabase, nunca se invocaba desde la UI).
DROP FUNCTION IF EXISTS public.audit_event_log_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.write_audit_event(uuid, bigint, bigint, text, bigint, text, jsonb, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.block_audit_event_log_mutations() CASCADE;
DROP FUNCTION IF EXISTS public.verify_audit_chain(bigint, text);

-- delete_draft_journal_entry y reopen_journal_entry solo referencian tab_audit_log
-- (verificado leyendo su definición) — no requieren ningún cambio, no se rompen.
-- clear_legacy_import_batch tampoco referencia audit_event_log.

-- Corrección adicional encontrada durante la revisión (fuera del alcance de
-- auditoría, pero es un bug real en producción): hard_reset_enterprise
-- todavía listaba 'fixed_asset_suppliers' en su array de tablas a limpiar,
-- tabla eliminada en una tarea anterior de esta misma rama. Sin esta
-- corrección, cualquier reset de empresa fallaría con "relation does not
-- exist". Se quita esa entrada, el resto de la función queda idéntico.
CREATE OR REPLACE FUNCTION public.hard_reset_enterprise(p_enterprise_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stats jsonb := '[]'::jsonb;
  v_start timestamptz;
  v_t0    timestamptz;
  v_deleted bigint;
  v_remaining bigint;
  v_tbl text;
  v_sql text;
  v_lock_key bigint;
  v_uid uuid := auth.uid();
  v_tables text[] := ARRAY[
    'tab_purchase_journal_links','tab_journal_entry_history','tab_journal_entry_metadata_changes',
    'tab_purchase_ledger','tab_sales_ledger','tab_purchase_books','tab_period_inventory_closing',
    'tab_bank_movements','tab_bank_documents','tab_bank_reconciliations','tab_bank_import_templates',
    'tab_bank_accounts','fixed_asset_depreciation_schedule','fixed_asset_event_log','fixed_assets',
    'fixed_asset_categories','fixed_asset_locations','fixed_asset_custodians',
    'fixed_asset_policy','tab_fx_settlements','tab_fx_open_balances','tab_fx_revaluation_runs',
    'tab_journal_entry_details','tab_journal_entries','tab_integrity_validations','tab_accounting_periods',
    'tab_book_folio_consumption','tab_book_authorizations','tab_integrity_rules_config','tab_holidays',
    'tab_tax_due_date_config','tab_alert_config','tab_custom_reminders','tab_notifications',
    'tab_role_permissions','tab_dashboard_card_config','tab_backup_history','tab_operation_types',
    'tab_tax_forms','tab_audit_log','tab_import_logs','tab_exchange_rates','tab_accounts'
  ];
BEGIN
  -- Authorization: service role (no auth.uid()) OR enterprise/super admin only
  IF v_uid IS NOT NULL AND NOT public.is_admin_for_enterprise(v_uid, p_enterprise_id) THEN
    RAISE EXCEPTION 'Permission denied for enterprise %', p_enterprise_id USING ERRCODE = '42501';
  END IF;

  v_lock_key := 7777777000000 + p_enterprise_id;
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RAISE EXCEPTION 'Another reset is already in progress for enterprise %', p_enterprise_id USING ERRCODE = '55P03';
  END IF;

  v_start := clock_timestamp();
  PERFORM set_config('app.import_mode', 'on', true);

  FOREACH v_tbl IN ARRAY v_tables LOOP
    v_t0 := clock_timestamp();
    IF v_tbl IN ('tab_purchase_journal_links','tab_journal_entry_history','tab_journal_entry_metadata_changes','tab_journal_entry_details') THEN
      v_sql := format('DELETE FROM public.%I t WHERE t.journal_entry_id IN (SELECT id FROM public.tab_journal_entries WHERE enterprise_id = %L)', v_tbl, p_enterprise_id);
    ELSIF v_tbl = 'tab_book_folio_consumption' THEN
      v_sql := format('DELETE FROM public.%I t WHERE t.authorization_id IN (SELECT id FROM public.tab_book_authorizations WHERE enterprise_id = %L)', v_tbl, p_enterprise_id);
    ELSE
      v_sql := format('DELETE FROM public.%I WHERE enterprise_id = %L', v_tbl, p_enterprise_id);
    END IF;

    EXECUTE v_sql;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    v_stats := v_stats || jsonb_build_object(
      'table', v_tbl,
      'deleted', v_deleted,
      'ms', round(EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'enterprise_id', p_enterprise_id,
    'total_ms', round(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000),
    'phases', v_stats
  );
END;
$function$;

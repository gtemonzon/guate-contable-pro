-- Entrega C — Sincronizar Cuentas por Cobrar/Pagar al editar una factura
--
-- auto_create_collection_tracking() (AFTER INSERT) copia total_amount e
-- invoice_date a tab_collection_tracking y ahí quedaban congelados: corregir el
-- monto o la fecha de la factura no se reflejaba en CxC/CxP. Esta migración agrega
-- un trigger AFTER UPDATE, separado, que mantiene la fila de seguimiento al día.
--
-- Se aplica manualmente vía MCP ANTES de publicar el frontend y se registra en
-- supabase_migrations.schema_migrations. Idempotente. Sin backfill: solo actúa
-- sobre las facturas que se editen a partir de ahora.
--
-- No toca auto_create_collection_tracking() ni agrega llaves foráneas. No hay
-- recursión: tab_collection_tracking no tiene triggers que escriban en los libros.

CREATE OR REPLACE FUNCTION public.sync_collection_tracking_on_ledger_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_direction      text;
  v_tracking       public.tab_collection_tracking%ROWTYPE;
  v_new_total      numeric(18,2);
  v_new_due_date   date;
  v_derived_due    date;
  v_old_status     text;
  v_new_status     text;
  v_derived_status text;
  v_actor_name     text;
  v_is_restore     boolean;
BEGIN
  -- 1. Importación masiva: no sincronizar (mismo guard que audit_trigger_function).
  IF current_setting('app.import_mode', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- 2. Dirección según el libro.
  IF TG_TABLE_NAME = 'tab_purchase_ledger' THEN
    v_direction := 'cxp';
  ELSIF TG_TABLE_NAME = 'tab_sales_ledger' THEN
    v_direction := 'cxc';
  ELSE
    RETURN NEW;
  END IF;

  -- 3. El borrado lógico no toca el seguimiento (la interfaz oculta la factura).
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_is_restore := OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL;

  -- 4. Nada relevante cambió. Una restauración siempre sigue: si el monto o la
  --    fecha cambiaron en el mismo UPDATE que la borró (paso 3 lo omitió), el
  --    seguimiento quedó atrasado y la comparación contra la fila (abajo) lo corrige.
  IF NOT v_is_restore
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.invoice_date IS NOT DISTINCT FROM OLD.invoice_date THEN
    RETURN NEW;
  END IF;

  -- 5. Fila de seguimiento. Si no existe, el módulo estaba desactivado al crear
  --    la factura: no se crea ahora (haría aparecer facturas viejas en CxC/CxP).
  SELECT * INTO v_tracking
    FROM public.tab_collection_tracking
   WHERE direction = v_direction AND source_ledger_id = NEW.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Se compara contra lo que tiene la fila de seguimiento (no solo contra OLD),
  -- así la sincronización también corrige una fila que ya estuviera atrasada.
  v_new_total := COALESCE(NEW.total_amount, 0);

  -- 7. Fechas, preservando un vencimiento ajustado a mano.
  v_new_due_date := v_tracking.due_date;
  IF NEW.invoice_date IS DISTINCT FROM v_tracking.issue_date THEN
    -- Vencimiento que le correspondía con la fecha anterior (issue_date, que es
    -- OLD.invoice_date salvo que la fila ya estuviera atrasada) y el plazo guardado.
    v_derived_due := public.calculate_due_date(
      NEW.enterprise_id, v_tracking.issue_date, v_tracking.payment_term_days
    );
    IF v_tracking.due_date = v_derived_due THEN
      -- Seguía siendo el derivado: se recalcula desde la nueva fecha.
      v_new_due_date := public.calculate_due_date(
        NEW.enterprise_id, NEW.invoice_date, v_tracking.payment_term_days
      );
    END IF;
    -- Si es distinto, alguien lo ajustó a mano: no se toca.
  END IF;

  -- 8. Estado, con la misma regla que computeStatus() del frontend.
  --    Solo se recalcula si el estado actual era el derivado de los montos
  --    anteriores; un estado puesto a mano (p. ej. "pagada" sin abonos completos)
  --    se respeta, igual que el vencimiento ajustado a mano.
  v_old_status := v_tracking.status;
  v_derived_status := CASE
    WHEN v_tracking.amount_paid >= v_tracking.amount_total - 0.005 THEN 'pagada'
    WHEN v_tracking.amount_paid > 0 THEN 'parcial'
    ELSE 'pendiente'
  END;

  IF v_old_status = v_derived_status THEN
    v_new_status := CASE
      WHEN v_tracking.amount_paid >= v_new_total - 0.005 THEN 'pagada'
      WHEN v_tracking.amount_paid > 0 THEN 'parcial'
      ELSE 'pendiente'
    END;
  ELSE
    v_new_status := v_old_status;
  END IF;

  -- Sin cambios efectivos en la fila de seguimiento: salir.
  IF v_new_total IS NOT DISTINCT FROM v_tracking.amount_total
     AND NEW.invoice_date IS NOT DISTINCT FROM v_tracking.issue_date
     AND v_new_due_date IS NOT DISTINCT FROM v_tracking.due_date
     AND v_new_status IS NOT DISTINCT FROM v_old_status THEN
    RETURN NEW;
  END IF;

  -- 6 + 7 + 8. Aplicar.
  UPDATE public.tab_collection_tracking
     SET amount_total = v_new_total,
         issue_date   = NEW.invoice_date,
         due_date     = v_new_due_date,
         status       = v_new_status,
         updated_at   = now()
   WHERE id = v_tracking.id;

  -- 9 y 10. Historial (solo si hay algo que registrar).
  IF v_new_status IS DISTINCT FROM v_old_status
     OR v_new_total < v_tracking.amount_paid - 0.005 THEN
    SELECT full_name INTO v_actor_name FROM public.tab_users WHERE id = auth.uid();
    v_actor_name := COALESCE(v_actor_name, 'Sistema');
  END IF;

  -- 9. Cambio de estado.
  IF v_new_status IS DISTINCT FROM v_old_status THEN
    INSERT INTO public.tab_collection_status_history (
      tracking_id, old_status, new_status, reason,
      changed_by, changed_by_name, is_manual
    ) VALUES (
      v_tracking.id, v_old_status, v_new_status,
      'Monto de la factura actualizado de Q' || to_char(v_tracking.amount_total, 'FM999,999,999,990.00')
        || ' a Q' || to_char(v_new_total, 'FM999,999,999,990.00'),
      auth.uid(), v_actor_name, false
    );
  END IF;

  -- 10. Sobrepago: los abonos superan el nuevo total. No se ajustan abonos ni
  --     amount_paid; queda la advertencia en el historial para decisión humana.
  --     Solo cuando cambió el monto, para no repetir el aviso en ediciones de fecha.
  IF v_new_total < v_tracking.amount_paid - 0.005
     AND v_new_total IS DISTINCT FROM v_tracking.amount_total THEN
    INSERT INTO public.tab_collection_status_history (
      tracking_id, old_status, new_status, reason,
      changed_by, changed_by_name, is_manual
    ) VALUES (
      v_tracking.id, v_new_status, v_new_status,
      'ATENCIÓN: los abonos registrados (Q' || to_char(v_tracking.amount_paid, 'FM999,999,999,990.00')
        || ') superan el nuevo total de la factura (Q' || to_char(v_new_total, 'FM999,999,999,990.00')
        || '). Revisa el monto o los abonos.',
      auth.uid(), v_actor_name, false
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Las funciones de trigger nunca deben poder invocarse directamente
-- (mismo criterio que 20260824144148).
REVOKE ALL ON FUNCTION public.sync_collection_tracking_on_ledger_update() FROM authenticated, anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_purchase_ledger_sync_collection_tracking ON public.tab_purchase_ledger;
CREATE TRIGGER trg_purchase_ledger_sync_collection_tracking
  AFTER UPDATE ON public.tab_purchase_ledger
  FOR EACH ROW EXECUTE FUNCTION public.sync_collection_tracking_on_ledger_update();

DROP TRIGGER IF EXISTS trg_sales_ledger_sync_collection_tracking ON public.tab_sales_ledger;
CREATE TRIGGER trg_sales_ledger_sync_collection_tracking
  AFTER UPDATE ON public.tab_sales_ledger
  FOR EACH ROW EXECUTE FUNCTION public.sync_collection_tracking_on_ledger_update();

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchLedgerNamesMap } from '@/utils/collectionLedger';
import type { Database } from '@/integrations/supabase/types';
import {
  getDaysUntil,
  getPriorityFromDays,
  formatDueDate,
  toDateOnlyString,
  parseDateOnly,
  TaxDueDateConfig,
  Holiday,
  getDefaultDueDateConfigs,
  isCalculationType,
  isReferencePeriod,
  parseHolidaysForYears,
  computeDueDateAlerts,
  isTaxAlertStale,
  PresentedTaxForm,
} from '@/utils/dueDateCalculations';
import { addMonths, subDays, differenceInDays } from 'date-fns';

/** Fila de tab_tax_due_date_config leída con select('*'); la vigencia puede no existir aún. */
interface TaxDueDateConfigRow {
  tax_type: string;
  tax_label: string;
  calculation_type: string;
  days_value: number;
  reference_period: string;
  consider_holidays: boolean;
  is_active: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

interface AlertConfig {
  alert_type: string;
  is_enabled: boolean;
  days_before: number;
}

type ModuleFlag = Pick<
  Database['public']['Tables']['tab_tenant_modules']['Row'],
  'module_key' | 'is_enabled'
>;

type AlertPriority = ReturnType<typeof getPriorityFromDays>;
const isAlertPriority = (value: unknown): value is AlertPriority =>
  value === 'urgente' || value === 'importante' || value === 'informativa';

/**
 * Guard global (a nivel de módulo) para evitar que dos componentes
 * (NotificationCenter + DashboardAlerts) ejecuten la generación en paralelo
 * para la misma empresa y creen notificaciones duplicadas.
 */
const inFlight = new Map<number, Promise<{ success: boolean; count: number }>>();
const lastRun = new Map<number, number>();
const COOLDOWN_MS = 60_000;

export function useAlertGenerator() {
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);

  const runGenerate = useCallback(async (enterpriseId: number) => {
    setGenerating(true);
    let alertsGenerated = 0;

    try {
      // Load alert configuration
      const { data: alertConfigs, error: alertConfigsError } = await supabase
        .from('tab_alert_config')
        .select('*')
        .eq('enterprise_id', enterpriseId);
      if (alertConfigsError) console.error('[alerts] error cargando tab_alert_config:', alertConfigsError);

      // Load tax due date configuration
      const { data: taxConfigs, error: taxConfigsError } = await supabase
        .from('tab_tax_due_date_config')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);
      if (taxConfigsError) console.error('[alerts] error cargando tab_tax_due_date_config:', taxConfigsError);

      // Load holidays
      const { data: holidays, error: holidaysError } = await supabase
        .from('tab_holidays')
        .select('*')
        .or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);
      if (holidaysError) console.error('[alerts] error cargando tab_holidays:', holidaysError);


      const today = new Date();
      // Feriados del año anterior, el actual y el siguiente (vencimientos de enero/diciembre).
      const parsedHolidays = parseHolidaysForYears((holidays || []) as Holiday[], today.getFullYear());

      // Helper to get alert config
      const getAlertConfig = (type: string): AlertConfig => {
        const config = (alertConfigs || []).find((c) => c.alert_type === type);
        return config || { alert_type: type, is_enabled: true, days_before: 5 };
      };

      // Helper to check if notification already exists.
      // Fail-safe: si la consulta falla, asumimos que SÍ existe para no
      // arriesgar la creación de un duplicado.
      const notificationExists = async (type: string, eventDate: string): Promise<boolean> => {
        const { data, error } = await supabase
          .from('tab_notifications')
          .select('id')
          .eq('enterprise_id', enterpriseId)
          .eq('notification_type', type)
          .eq('event_date', eventDate)
          .limit(1);
        if (error) {
          console.error('[alerts] error verificando notificación existente:', error);
          return true;
        }
        return (data || []).length > 0;
      };

      // Helper to create notification
      const createAlert = async (
        type: string,
        title: string,
        description: string,
        eventDate: Date,
        priority: 'urgente' | 'importante' | 'informativa',
        actionUrl: string
      ) => {
        const eventDateStr = toDateOnlyString(eventDate);
        const exists = await notificationExists(type, eventDateStr);
        if (exists) return false;

        const { error } = await supabase
          .from('tab_notifications')
          .insert({
            enterprise_id: enterpriseId,
            notification_type: type,
            title,
            description,
            event_date: eventDateStr,
            priority,
            action_url: actionUrl,
            is_read: false,
          });

        if (!error) {
          alertsGenerated++;
          return true;
        }
        // 23505 = unique_violation: el índice parcial
        // idx_notifications_dedupe_unread bloqueó un duplicado (condición de
        // carrera). Se ignora silenciosamente: la BD hizo su trabajo.
        if (error.code === '23505') return false;
        console.error('[alerts] error creando notificación:', error);
        return false;
      };


      // 1. Generate tax due date alerts
      const taxConfigRows = (taxConfigs || []) as unknown as TaxDueDateConfigRow[];
      const effectiveTaxConfigs: TaxDueDateConfig[] = taxConfigRows.length > 0
        ? taxConfigRows.map((c) => ({
            tax_type: c.tax_type,
            tax_label: c.tax_label,
            calculation_type: isCalculationType(c.calculation_type) ? c.calculation_type : 'last_business_day',
            days_value: c.days_value,
            reference_period: isReferencePeriod(c.reference_period) ? c.reference_period : 'current_month',
            consider_holidays: c.consider_holidays,
            is_active: c.is_active,
            effective_from: c.effective_from ?? null,
            effective_to: c.effective_to ?? null,
          }))
        // Sin filas propias: valores por defecto con sus estados (solo IVA mensual e
        // ISR trimestral activos).
        : getDefaultDueDateConfigs();

      // Formularios presentados (activos): con period_type para distinguir los
      // trimestrales (period_month = mes de inicio del trimestre).
      const { data: presentedFormsData, error: presentedFormsError } = await supabase
        .from('tab_tax_forms')
        .select('tax_type, period_month, period_year, period_type')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);
      if (presentedFormsError) console.error('[alerts] error cargando tab_tax_forms:', presentedFormsError);
      const presentedForms: PresentedTaxForm[] = presentedFormsData || [];

      // 1a. Auto-sanado GLOBAL de alertas de vencimiento fiscal no leídas, sin
      // importar su event_date: se borran si el formulario del período que cubren
      // ya se presentó, si la config ya no está activa o su vigencia no cubre ese
      // período, o si vencieron hace más de 60 días.
      // vencimiento_cxc/vencimiento_cxp quedan excluidas: ya tienen su
      // propio manejo de "una sola viva a la vez" en la sección 4b.
      const NON_TAX_VENCIMIENTO_TYPES = new Set(['vencimiento_cxc', 'vencimiento_cxp']);
      const { data: unreadTaxAlerts, error: unreadTaxAlertsError } = await supabase
        .from('tab_notifications')
        .select('id, notification_type, event_date')
        .eq('enterprise_id', enterpriseId)
        .eq('is_read', false)
        .like('notification_type', 'vencimiento_%');
      if (unreadTaxAlertsError) console.error('[alerts] error cargando alertas de vencimiento para auto-sanado:', unreadTaxAlertsError);

      const staleTaxAlertIds: number[] = [];
      for (const alert of (unreadTaxAlerts || [])) {
        if (NON_TAX_VENCIMIENTO_TYPES.has(alert.notification_type)) continue;
        if (!alert.event_date) continue;
        if (isTaxAlertStale({
          notificationType: alert.notification_type,
          eventDate: alert.event_date,
          configs: effectiveTaxConfigs,
          forms: presentedForms,
          today,
        })) {
          staleTaxAlertIds.push(alert.id);
        }
      }
      if (staleTaxAlertIds.length > 0) {
        await supabase.from('tab_notifications').delete().in('id', staleTaxAlertIds);
      }

      // 1b. Vencimientos de los meses alrededor de hoy (no solo el mes en curso).
      const alertConfigFor = (taxType: string) => getAlertConfig(`vencimiento_${taxType}`);
      const dueDateAlerts = computeDueDateAlerts({
        configs: effectiveTaxConfigs,
        holidays: parsedHolidays,
        forms: presentedForms,
        today,
        alertConfigFor,
      });

      // Los que solo faltan por tener el formulario presentado: se limpia su
      // notificación (leída o no) para ese impuesto y fecha.
      const alertKey = (a: { taxType: string; dueDate: Date }) => `${a.taxType}|${toDateOnlyString(a.dueDate)}`;
      const pendingKeys = new Set(dueDateAlerts.map(alertKey));
      const presentedCandidates = computeDueDateAlerts({
        configs: effectiveTaxConfigs,
        holidays: parsedHolidays,
        forms: [],
        today,
        alertConfigFor,
      }).filter((a) => !pendingKeys.has(alertKey(a)));
      for (const presented of presentedCandidates) {
        await supabase
          .from('tab_notifications')
          .delete()
          .eq('enterprise_id', enterpriseId)
          .eq('notification_type', `vencimiento_${presented.taxType}`)
          .eq('event_date', toDateOnlyString(presented.dueDate));
      }

      for (const alert of dueDateAlerts) {
        await createAlert(
          `vencimiento_${alert.taxType}`,
          `Vencimiento ${alert.label} — ${alert.periodLabel}`,
          `Fecha límite: ${formatDueDate(alert.dueDate)}`,
          alert.dueDate,
          alert.priority,
          '/generar-declaracion'
        );
      }

      // 2. Check for unclosed accounting periods
      const alertConfigPeriods = getAlertConfig('periodo_pendiente');

      // 2a. Auto-sanado: eliminar alertas de períodos que ya NO están abiertos
      const { data: allPeriods, error: allPeriodsError } = await supabase
        .from('tab_accounting_periods')
        .select('year, end_date, status')
        .eq('enterprise_id', enterpriseId);
      if (allPeriodsError) console.error('[alerts] error cargando períodos contables:', allPeriodsError);

      const closedEndDates = (allPeriods || [])
        .filter((p) => p.status !== 'abierto')
        .map((p) => p.end_date)
        .filter(Boolean);

      if (closedEndDates.length > 0) {
        await supabase
          .from('tab_notifications')
          .delete()
          .eq('enterprise_id', enterpriseId)
          .eq('notification_type', 'periodo_pendiente')
          .in('event_date', closedEndDates);
      }

      if (!alertConfigPeriods.is_enabled) {
        await supabase
          .from('tab_notifications')
          .delete()
          .eq('enterprise_id', enterpriseId)
          .eq('notification_type', 'periodo_pendiente')
          .eq('is_read', false);
      }

      if (alertConfigPeriods.is_enabled) {
        const { data: pendingPeriods, error: pendingPeriodsError } = await supabase
          .from('tab_accounting_periods')
          .select('id, year, end_date')
          .eq('enterprise_id', enterpriseId)
          .eq('status', 'abierto')
          .lt('end_date', toDateOnlyString(today));
        if (pendingPeriodsError) console.error('[alerts] error cargando períodos pendientes:', pendingPeriodsError);

        for (const period of (pendingPeriods || [])) {
          const endDate = parseDateOnly(period.end_date);
          const daysPast = differenceInDays(today, endDate);

          if (daysPast >= alertConfigPeriods.days_before) {
            await createAlert(
              'periodo_pendiente',
              'Período contable pendiente de cierre',
              `El período ${period.year} finalizó hace ${daysPast} días y aún no ha sido cerrado.`,
              endDate,
              daysPast > 30 ? 'urgente' : 'importante',
              '/periodos'
            );
          }
        }
      }

      // Helper: elimina notificaciones no leídas de un tipo (supersede / auto-sanado)
      const clearUnread = async (type: string) => {
        await supabase
          .from('tab_notifications')
          .delete()
          .eq('enterprise_id', enterpriseId)
          .eq('notification_type', type)
          .eq('is_read', false);
      };

      // 3. Check for draft journal entries older than N days
      const alertConfigDrafts = getAlertConfig('partida_borrador');
      if (alertConfigDrafts.is_enabled) {
        const draftDays = alertConfigDrafts.days_before || 7;
        const sevenDaysAgo = subDays(today, draftDays);

        const { data: draftEntries, count, error: draftEntriesError } = await supabase
          .from('tab_journal_entries')
          .select('id, entry_number', { count: 'exact' })
          .eq('enterprise_id', enterpriseId)
          .in('status', ['borrador', 'pendiente_revision'])
          .lt('created_at', sevenDaysAgo.toISOString())
          .order('entry_date', { ascending: false });
        if (draftEntriesError) console.error('[alerts] error cargando partidas en borrador:', draftEntriesError);

        // Siempre reemplazar/limpiar las pendientes previas no leídas
        await clearUnread('partida_borrador');

        if (count && count > 0) {
          const numbers = (draftEntries || [])
            .map((e) => e.entry_number)
            .filter(Boolean);
          const shown = numbers.slice(0, 3).join(', ');
          const extra = numbers.length > 3 ? ` (+${numbers.length - 3} más)` : '';
          const detail = shown ? ` Pendientes: ${shown}${extra}.` : '';

          await createAlert(
            'partida_borrador',
            `${count} partida${count > 1 ? 's' : ''} en borrador`,
            `Hay ${count} partida${count > 1 ? 's' : ''} pendiente${count > 1 ? 's' : ''} de revisión con más de ${draftDays} días.${detail}`,
            today,
            count > 10 ? 'urgente' : 'importante',
            '/partidas'
          );
        }
      }

      // 4. Check for pending bank reconciliations
      const alertConfigConciliacion = getAlertConfig('conciliacion_pendiente');
      if (alertConfigConciliacion.is_enabled) {
        const reconDays = alertConfigConciliacion.days_before || 30;
        const thirtyDaysAgo = subDays(today, reconDays);

        const { count: movCount, error: movCountError } = await supabase
          .from('tab_bank_movements')
          .select('id', { count: 'exact', head: true })
          .eq('enterprise_id', enterpriseId)
          .eq('is_reconciled', false)
          .lt('movement_date', toDateOnlyString(thirtyDaysAgo));
        if (movCountError) console.error('[alerts] error contando movimientos bancarios:', movCountError);

        await clearUnread('conciliacion_pendiente');

        if (movCount && movCount > 0) {
          await createAlert(
            'conciliacion_pendiente',
            'Movimientos bancarios sin conciliar',
            `Hay ${movCount} movimiento${movCount > 1 ? 's' : ''} bancario${movCount > 1 ? 's' : ''} con más de ${reconDays} días sin conciliar.`,
            today,
            movCount > 20 ? 'urgente' : 'importante',
            '/conciliacion'
          );
        }
      }


      // 4b. Collections tracking (CxC / CxP) — aggregated notification per direction
      // Module must be enabled at BOTH levels: enterprise and tenant.
      const { data: enterpriseRow, error: enterpriseRowError } = await supabase
        .from('tab_enterprises')
        .select('tenant_id')
        .eq('id', enterpriseId)
        .maybeSingle();
      if (enterpriseRowError) console.error('[alerts] error cargando la empresa:', enterpriseRowError);

      const { data: entModules, error: entModulesError } = await supabase
        .from('tab_enterprise_modules')
        .select('module_key, is_enabled')
        .eq('enterprise_id', enterpriseId);
      if (entModulesError) console.error('[alerts] error cargando módulos de empresa:', entModulesError);

      const tenantId = enterpriseRow?.tenant_id ?? null;
      const { data: tenantModules, error: tenantModulesError } = tenantId
        ? await supabase
            .from('tab_tenant_modules')
            .select('module_key, is_enabled')
            .eq('tenant_id', tenantId)
        : { data: [] as ModuleFlag[], error: null };
      if (tenantModulesError) console.error('[alerts] error cargando módulos del tenant:', tenantModulesError);

      const moduleEnabled = (key: string) =>
        (entModules || []).some((m) => m.module_key === key && m.is_enabled) &&
        (tenantModules || []).some((m) => m.module_key === key && m.is_enabled);

      for (const dir of ['cxc', 'cxp'] as const) {
        const alertType = `vencimiento_${dir}`;
        const cfg = getAlertConfig(alertType);
        if (!cfg.is_enabled) { await clearUnread(alertType); continue; }
        if (!moduleEnabled(dir)) { await clearUnread(alertType); continue; }

        const horizon = new Date(today);
        horizon.setDate(horizon.getDate() + (cfg.days_before || 5));
        const horizonStr = toDateOnlyString(horizon);

        const { data: dueRows, error: dueRowsError } = await supabase
          .from('tab_collection_tracking')
          .select('source_ledger_id, due_date, amount_total, amount_paid, status')
          .eq('enterprise_id', enterpriseId)
          .eq('direction', dir)
          .neq('status', 'pagada')
          .lte('due_date', horizonStr);
        if (dueRowsError) console.error('[alerts] error cargando seguimiento de cobros:', dueRowsError);

        // Facturas borradas (borrado lógico) no cuentan como saldo pendiente: su
        // fila de seguimiento sigue en la base, pero la factura ya no está en el libro.
        let liveLedger: Map<number, unknown>;
        try {
          liveLedger = await fetchLedgerNamesMap(dir, (dueRows || []).map((r) => Number(r.source_ledger_id)));
        } catch (err) {
          console.error('[alerts] error verificando facturas de seguimiento:', err);
          continue; // sin datos confiables, no se actualiza esta alerta
        }
        const rows = (dueRows || []).filter((r) => liveLedger.has(Number(r.source_ledger_id)));
        if (rows.length === 0) { await clearUnread(alertType); continue; }

        const todayStr = toDateOnlyString(today);
        const hasOverdue = rows.some((r) => r.due_date < todayStr);
        const totalPending = rows.reduce(
          (sum: number, r) => sum + (Number(r.amount_total) - Number(r.amount_paid || 0)),
          0
        );

        // Keep at most one live (unread) notification per type/enterprise:
        // remove previous unread ones before inserting today's refreshed alert.
        await supabase
          .from('tab_notifications')
          .delete()
          .eq('enterprise_id', enterpriseId)
          .eq('notification_type', alertType)
          .eq('is_read', false);

        const label = dir === 'cxc' ? 'por cobrar' : 'por pagar';
        const fmt = totalPending.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
        await createAlert(
          alertType,
          `${rows.length} factura${rows.length > 1 ? 's' : ''} ${label} próxima${rows.length > 1 ? 's' : ''} a vencer o vencida${rows.length > 1 ? 's' : ''}`,
          `Monto pendiente total: ${fmt}${hasOverdue ? ' (con facturas ya vencidas)' : ''}.`,
          today,
          hasOverdue ? 'urgente' : 'importante',
          dir === 'cxc' ? '/cuentas-por-cobrar' : '/cuentas-por-pagar'
        );
      }


      // 5. Check for custom reminders due soon
      const { data: reminders, error: remindersError } = await supabase
        .from('tab_custom_reminders')
        .select('*')
        .eq('is_completed', false)
        .or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`)
        .lte('reminder_date', toDateOnlyString(addMonths(today, 1)));
      if (remindersError) console.error('[alerts] error cargando recordatorios:', remindersError);

      for (const reminder of (reminders || [])) {
        const reminderDate = parseDateOnly(reminder.reminder_date);
        const daysUntil = getDaysUntil(reminderDate);

        if (daysUntil <= 5 && daysUntil >= -1) {
          await createAlert(
            'recordatorio_custom',
            reminder.title,
            reminder.description || `Recordatorio para ${formatDueDate(reminderDate)}`,
            reminderDate,
            isAlertPriority(reminder.priority) ? reminder.priority : getPriorityFromDays(daysUntil),
            '/notificaciones'
          );
        }
      }

      setLastGenerated(new Date());
      return { success: true, count: alertsGenerated };
    } catch (error) {
      console.error('Error generating alerts:', error);
      return { success: false, count: 0 };
    } finally {
      setGenerating(false);
    }
  }, []);

  const generateAlerts = useCallback(async (enterpriseId: number) => {
    if (!enterpriseId) return { success: false, count: 0 };

    // Si ya hay una generación en curso para esta empresa, reutilizarla
    const pending = inFlight.get(enterpriseId);
    if (pending) return pending;

    // Enfriamiento: evita regenerar en cada montaje de componente
    const last = lastRun.get(enterpriseId) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) return { success: true, count: 0 };

    const promise = runGenerate(enterpriseId).finally(() => {
      inFlight.delete(enterpriseId);
      lastRun.set(enterpriseId, Date.now());
    });
    inFlight.set(enterpriseId, promise);
    return promise;
  }, [runGenerate]);

  return {
    generateAlerts,
    generating,
    lastGenerated,
  };
}

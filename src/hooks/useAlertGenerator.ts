import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  calculateDueDate, 
  parseHolidays, 
  getDaysUntil, 
  getPriorityFromDays,
  formatDueDate,
  TaxDueDateConfig,
  Holiday,
  getDefaultTaxConfigs,
  getReferenceDate,
} from '@/utils/dueDateCalculations';
import { addMonths, subDays, differenceInDays, getMonth, getYear } from 'date-fns';

/**
 * Map tax_type code (from tab_tax_due_date_config) to substrings that
 * may appear in tab_tax_forms.tax_type (free-text written by users).
 * Match is case-insensitive and includes any of the listed tokens.
 */
const TAX_TYPE_MATCHERS: Record<string, string[]> = {
  iva: ['iva'],
  iva_mensual: ['iva'],
  isr_mensual: ['isr'],
  isr_trimestral: ['isr'],
  iso: ['iso'],
  iso_trimestral: ['iso'],
  retencion_iva: ['ret', 'iva'],
  retenciones_iva: ['ret', 'iva'],
  retencion_isr: ['ret', 'isr'],
  retenciones_isr: ['ret', 'isr'],
  isr_anual: ['isr', 'anual'],
};

function taxFormMatchesType(formTaxType: string | null | undefined, configTaxType: string): boolean {
  if (!formTaxType) return false;
  const normalized = formTaxType.toLowerCase().trim();
  const matchers = TAX_TYPE_MATCHERS[configTaxType] ?? [configTaxType.toLowerCase()];
  // For combined matchers (e.g. retenciones_iva needs BOTH 'ret' and 'iva'),
  // require all tokens to appear; for single-token matchers, just one.
  if (matchers.length === 1) return normalized.includes(matchers[0]);
  return matchers.every((token) => normalized.includes(token));
}

interface AlertConfig {
  alert_type: string;
  is_enabled: boolean;
  days_before: number;
}

export function useAlertGenerator() {
  const [generating, setGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null);

  const generateAlerts = useCallback(async (enterpriseId: number) => {
    if (!enterpriseId) return { success: false, count: 0 };

    setGenerating(true);
    let alertsGenerated = 0;

    try {
      // Load alert configuration
      const { data: alertConfigs } = await supabase
        .from('tab_alert_config')
        .select('*')
        .eq('enterprise_id', enterpriseId);

      // Load tax due date configuration
      const { data: taxConfigs } = await supabase
        .from('tab_tax_due_date_config')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);

      // Load holidays
      const { data: holidays } = await supabase
        .from('tab_holidays')
        .select('*')
        .or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`);

      const parsedHolidays = parseHolidays((holidays || []) as Holiday[]);
      const today = new Date();
      const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      // Helper to get alert config
      const getAlertConfig = (type: string): AlertConfig => {
        const config = (alertConfigs || []).find((c: any) => c.alert_type === type);
        return config || { alert_type: type, is_enabled: true, days_before: 5 };
      };

      // Helper to check if notification already exists
      const notificationExists = async (type: string, eventDate: string): Promise<boolean> => {
        const { data } = await supabase
          .from('tab_notifications')
          .select('id')
          .eq('enterprise_id', enterpriseId)
          .eq('notification_type', type)
          .eq('event_date', eventDate)
          .limit(1);
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
        const eventDateStr = eventDate.toISOString().split('T')[0];
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
        return false;
      };

      // 1. Generate tax due date alerts
      const effectiveTaxConfigs: TaxDueDateConfig[] = (taxConfigs && taxConfigs.length > 0)
        ? taxConfigs.map((c: any) => ({
            tax_type: c.tax_type,
            tax_label: c.tax_label,
            calculation_type: c.calculation_type,
            days_value: c.days_value,
            reference_period: c.reference_period,
            consider_holidays: c.consider_holidays,
            is_active: c.is_active,
          }))
        : getDefaultTaxConfigs().map(c => ({ ...c, is_active: true }));

      // Pre-fetch presented tax forms (active) for this enterprise to skip
      // alerts whose underlying tax form has already been filed.
      const { data: presentedForms } = await supabase
        .from('tab_tax_forms')
        .select('tax_type, period_month, period_year')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);

      const isFormAlreadyPresented = (
        configTaxType: string,
        periodMonth: number,
        periodYear: number,
      ): boolean => {
        return (presentedForms || []).some((f) =>
          f.period_month === periodMonth &&
          f.period_year === periodYear &&
          taxFormMatchesType(f.tax_type, configTaxType)
        );
      };

      for (const taxConfig of effectiveTaxConfigs) {
        const alertConfig = getAlertConfig(`vencimiento_${taxConfig.tax_type}`);
        if (!alertConfig.is_enabled) continue;

        const dueDate = calculateDueDate(currentMonth, taxConfig, parsedHolidays);
        const daysUntil = getDaysUntil(dueDate);

        if (daysUntil <= alertConfig.days_before && daysUntil >= -1) {
          // Determine the reference period (month/year the form would cover).
          const referenceDate = getReferenceDate(currentMonth, taxConfig.reference_period);
          // Tax forms typically cover the month BEFORE the due-date reference month
          // (e.g. IVA con vencimiento 30/04 corresponde al período de marzo).
          const periodCovered = subDays(new Date(getYear(referenceDate), getMonth(referenceDate), 1), 1);
          const periodMonth = getMonth(periodCovered) + 1; // 1-indexed
          const periodYear = getYear(periodCovered);

          // Skip alert if the corresponding tax form has already been filed.
          if (isFormAlreadyPresented(taxConfig.tax_type, periodMonth, periodYear)) {
            // Also clean up any stale notifications previously generated for this due date.
            await supabase
              .from('tab_notifications')
              .delete()
              .eq('enterprise_id', enterpriseId)
              .eq('notification_type', `vencimiento_${taxConfig.tax_type}`)
              .eq('event_date', dueDate.toISOString().split('T')[0]);
            continue;
          }

          const priority = getPriorityFromDays(daysUntil);
          const daysText = daysUntil === 0 ? 'Vence hoy' :
                          daysUntil < 0 ? 'Vencido' :
                          daysUntil === 1 ? 'Vence mañana' :
                          `Quedan ${daysUntil} días`;

          await createAlert(
            `vencimiento_${taxConfig.tax_type}`,
            `Vencimiento ${taxConfig.tax_label}`,
            `${daysText}. Fecha límite: ${formatDueDate(dueDate)}`,
            dueDate,
            priority,
            '/generar-declaracion'
          );
        }
      }

      // 2. Check for unclosed accounting periods
      const alertConfigPeriods = getAlertConfig('periodo_pendiente');
      if (alertConfigPeriods.is_enabled) {
        const { data: pendingPeriods } = await supabase
          .from('tab_accounting_periods')
          .select('id, year, end_date')
          .eq('enterprise_id', enterpriseId)
          .eq('status', 'abierto')
          .lt('end_date', today.toISOString().split('T')[0]);

        for (const period of (pendingPeriods || [])) {
          const endDate = new Date(period.end_date);
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

      // 3. Check for draft journal entries older than 7 days
      const alertConfigDrafts = getAlertConfig('partida_borrador');
      if (alertConfigDrafts.is_enabled) {
        const sevenDaysAgo = subDays(today, alertConfigDrafts.days_before || 7);

        const { data: draftEntries, count } = await supabase
          .from('tab_journal_entries')
          .select('id', { count: 'exact' })
          .eq('enterprise_id', enterpriseId)
          .in('status', ['borrador', 'pendiente_revision'])
          .lt('created_at', sevenDaysAgo.toISOString());

        if (count && count > 0) {
          const existingCheck = await supabase
            .from('tab_notifications')
            .select('id')
            .eq('enterprise_id', enterpriseId)
            .eq('notification_type', 'partida_borrador')
            .gte('created_at', subDays(today, 1).toISOString())
            .limit(1);

          if (!(existingCheck.data || []).length) {
            await createAlert(
              'partida_borrador',
              `${count} partida${count > 1 ? 's' : ''} en borrador`,
              `Hay ${count} partida${count > 1 ? 's' : ''} pendiente${count > 1 ? 's' : ''} de revisión con más de ${alertConfigDrafts.days_before || 7} días.`,
              today,
              count > 10 ? 'urgente' : 'importante',
              '/partidas'
            );
          }
        }
      }

      // 4. Check for pending bank reconciliations
      const alertConfigConciliacion = getAlertConfig('conciliacion_pendiente');
      if (alertConfigConciliacion.is_enabled) {
        const thirtyDaysAgo = subDays(today, alertConfigConciliacion.days_before || 30);

        const { data: pendingMovements, count: movCount } = await supabase
          .from('tab_bank_movements')
          .select('id', { count: 'exact' })
          .eq('enterprise_id', enterpriseId)
          .eq('is_reconciled', false)
          .lt('movement_date', thirtyDaysAgo.toISOString().split('T')[0]);

        if (movCount && movCount > 0) {
          const existingCheck = await supabase
            .from('tab_notifications')
            .select('id')
            .eq('enterprise_id', enterpriseId)
            .eq('notification_type', 'conciliacion_pendiente')
            .gte('created_at', subDays(today, 1).toISOString())
            .limit(1);

          if (!(existingCheck.data || []).length) {
            await createAlert(
              'conciliacion_pendiente',
              'Movimientos bancarios sin conciliar',
              `Hay ${movCount} movimiento${movCount > 1 ? 's' : ''} bancario${movCount > 1 ? 's' : ''} con más de ${alertConfigConciliacion.days_before || 30} días sin conciliar.`,
              today,
              movCount > 20 ? 'urgente' : 'importante',
              '/conciliacion'
            );
          }
        }
      }

      // 5. Check for custom reminders due soon
      const { data: reminders } = await supabase
        .from('tab_custom_reminders')
        .select('*')
        .eq('is_completed', false)
        .or(`enterprise_id.eq.${enterpriseId},enterprise_id.is.null`)
        .lte('reminder_date', addMonths(today, 1).toISOString().split('T')[0]);

      for (const reminder of (reminders || [])) {
        const reminderDate = new Date(reminder.reminder_date);
        const daysUntil = getDaysUntil(reminderDate);

        if (daysUntil <= 5 && daysUntil >= -1) {
          await createAlert(
            'recordatorio_custom',
            reminder.title,
            reminder.description || `Recordatorio para ${formatDueDate(reminderDate)}`,
            reminderDate,
            reminder.priority as any || getPriorityFromDays(daysUntil),
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

  return {
    generateAlerts,
    generating,
    lastGenerated,
  };
}

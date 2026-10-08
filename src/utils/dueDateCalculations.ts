import { addDays, subDays, endOfMonth, startOfMonth, isWeekend, isSameDay, format, getMonth, getYear, addMonths } from 'date-fns';
import { isTaxConfigValidForMonth, isTaxConfigValidForRange } from './taxConfigValidity';

export interface TaxDueDateConfig {
  tax_type: string;
  tax_label: string;
  calculation_type: 'last_business_day' | 'business_days_after' | 'fixed_day';
  days_value: number;
  reference_period: 'current_month' | 'next_month' | 'quarter_end_next_month';
  consider_holidays: boolean;
  is_active: boolean;
  /** Vigencia sobre el PERÍODO CUBIERTO ('YYYY-MM-DD'); NULL/ausente = sin límite. */
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface Holiday {
  holiday_date: string;
  description: string;
  is_recurring: boolean;
}

/**
 * Check if a date is a holiday
 */
export function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some(holiday => isSameDay(date, holiday));
}

/**
 * Check if a date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date, holidays: Date[]): boolean {
  return !isWeekend(date) && !isHoliday(date, holidays);
}

/**
 * Get the last business day of a given month
 */
export function getLastBusinessDay(date: Date, holidays: Date[]): Date {
  let lastDay = endOfMonth(date);
  while (!isBusinessDay(lastDay, holidays)) {
    lastDay = subDays(lastDay, 1);
  }
  return lastDay;
}

/**
 * Add X business days to the start of a month
 */
export function addBusinessDays(date: Date, businessDays: number, holidays: Date[]): Date {
  let current = startOfMonth(date);
  let count = 0;
  
  while (count < businessDays) {
    current = addDays(current, 1);
    if (isBusinessDay(current, holidays)) {
      count++;
    }
  }
  return current;
}

/**
 * Get the reference date based on the period type
 */
export function getReferenceDate(periodDate: Date, referencePeriod: string): Date {
  switch (referencePeriod) {
    case 'next_month':
      return addMonths(periodDate, 1);
    case 'quarter_end_next_month': {
      const month = getMonth(periodDate);
      const quarterEndMonth = Math.floor(month / 3) * 3 + 2; // 2, 5, 8, 11
      const quarterEnd = new Date(getYear(periodDate), quarterEndMonth, 1);
      return addMonths(quarterEnd, 1);
    }
    case 'current_month':
    default:
      return periodDate;
  }
}

/**
 * Calculate due date based on configuration
 */
export function calculateDueDate(
  periodDate: Date,
  config: TaxDueDateConfig,
  holidays: Date[]
): Date {
  const referenceDate = getReferenceDate(periodDate, config.reference_period);
  const holidaysToConsider = config.consider_holidays ? holidays : [];
  
  switch (config.calculation_type) {
    case 'last_business_day':
      return getLastBusinessDay(referenceDate, holidaysToConsider);
    case 'business_days_after':
      return addBusinessDays(referenceDate, config.days_value, holidaysToConsider);
    case 'fixed_day': {
      const year = getYear(referenceDate);
      const month = getMonth(referenceDate);
      let dueDate = new Date(year, month, config.days_value);
      // If the fixed day doesn't exist in this month, use last day
      if (dueDate.getMonth() !== month) {
        dueDate = endOfMonth(referenceDate);
      }
      return dueDate;
    }
    default:
      return endOfMonth(referenceDate);
  }
}

/**
 * Convert holiday records to Date array for calculations
 */
export function parseHolidays(holidays: Holiday[], year?: number): Date[] {
  const targetYear = year || new Date().getFullYear();
  
  return holidays.map(h => {
    const date = new Date(h.holiday_date);
    if (h.is_recurring) {
      // For recurring holidays, use the target year
      return new Date(targetYear, date.getMonth(), date.getDate());
    }
    return date;
  }).filter(d => !isNaN(d.getTime()));
}

/**
 * Get days until a due date (desde `now`, por omisión hoy; ambos a medianoche local)
 */
export function getDaysUntil(dueDate: Date, now: Date = new Date()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Determine priority based on days until due date
 */
export function getPriorityFromDays(daysUntil: number): 'urgente' | 'importante' | 'informativa' {
  if (daysUntil <= 2) return 'urgente';
  if (daysUntil <= 7) return 'importante';
  return 'informativa';
}

/**
 * Format due date for display
 */
export function formatDueDate(date: Date): string {
  return format(date, 'dd/MM/yyyy');
}

/**
 * Formatea una fecha como "YYYY-MM-DD" usando sus componentes LOCALES
 * (getFullYear/getMonth/getDate), nunca toISOString(). Un Date construido
 * por funciones de date-fns como endOfMonth (que fija la hora a
 * 23:59:59.999) puede, combinado con un huso horario negativo como el de
 * Guatemala (UTC-6), representar en UTC el día SIGUIENTE al día calendario
 * local real — toISOString().split('T')[0] hereda ese corrimiento. Esta
 * función siempre refleja el día calendario tal como lo ve el usuario.
 */
export function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parsea una fecha "YYYY-MM-DD" (columna date de Postgres) como medianoche
 * LOCAL, nunca con `new Date(dateStr)` — ese constructor interpreta un
 * string "YYYY-MM-DD" como medianoche UTC, que en un huso horario negativo
 * como Guatemala (UTC-6) se ve localmente como las 18:00 del día ANTERIOR,
 * corriendo la fecha un día hacia atrás al formatear o comparar.
 */
export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Texto relativo ("Vence hoy" / "Vence mañana" / "Quedan N días" /
 * "Vencido hace N días") calculado en el momento de mostrarlo — nunca debe
 * persistirse en la base de datos, porque deja de ser cierto con el paso
 * del tiempo (ej. "Vence mañana" guardado hace una semana sigue mostrando
 * "Vence mañana" si se persiste el texto en vez del dato).
 */
export function getRelativeDueDateText(dueDate: Date): string {
  const daysUntil = getDaysUntil(dueDate);
  if (daysUntil === 0) return 'Vence hoy';
  if (daysUntil === 1) return 'Vence mañana';
  if (daysUntil > 1) return `Quedan ${daysUntil} días`;
  const daysAgo = Math.abs(daysUntil);
  return `Vencido hace ${daysAgo} día${daysAgo === 1 ? '' : 's'}`;
}

/**
 * Deriva el período (mes/año) que cubre un vencimiento fiscal a partir de
 * su propia fecha límite (dueDate), sin necesitar el mes ancla
 * ("currentMonth") con el que se calculó originalmente. Válido porque,
 * para toda combinación real de calculation_type/reference_period usada en
 * este módulo, el mes de dueDate siempre coincide con el mes de
 * referenceDate (last_business_day y fixed_day operan dentro del mismo mes
 * de referencia; business_days_after con los valores configurados en la
 * app nunca se sale de él) — así que "el mes anterior al de dueDate" es
 * siempre el período cubierto, igual que ya hacía el ciclo con
 * referenceDate. Reutilizada tanto por el ciclo normal (con el dueDate
 * recién calculado) como por el auto-sanado de alertas viejas (con el
 * event_date ya guardado en la notificación).
 */
export function derivePeriodCovered(dueDate: Date): { periodMonth: number; periodYear: number } {
  const periodCovered = subDays(new Date(dueDate.getFullYear(), dueDate.getMonth(), 1), 1);
  return {
    periodMonth: getMonth(periodCovered) + 1, // 1-indexed
    periodYear: getYear(periodCovered),
  };
}

/** Nombres de mes en español, 1-indexado (índice 0 vacío) para usar junto a periodMonth/getMonth()+1. */
export const MONTH_NAMES_ES = [
  '',
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * Get default tax due date configurations for Guatemala
 */
export function getDefaultTaxConfigs(): Omit<TaxDueDateConfig, 'is_active'>[] {
  return [
    {
      tax_type: 'iva',
      tax_label: 'IVA Mensual',
      calculation_type: 'last_business_day',
      days_value: 0,
      reference_period: 'current_month',
      consider_holidays: true,
    },
    {
      tax_type: 'isr_trimestral',
      tax_label: 'ISR Trimestral',
      calculation_type: 'last_business_day',
      days_value: 0,
      reference_period: 'quarter_end_next_month',
      consider_holidays: true,
    },
    {
      tax_type: 'iso',
      tax_label: 'ISO Trimestral',
      calculation_type: 'last_business_day',
      days_value: 0,
      reference_period: 'quarter_end_next_month',
      consider_holidays: true,
    },
    {
      tax_type: 'isr_mensual',
      tax_label: 'ISR Mensual (Retenciones)',
      calculation_type: 'business_days_after',
      days_value: 10,
      reference_period: 'next_month',
      consider_holidays: true,
    },
    {
      tax_type: 'retenciones_iva',
      tax_label: 'Retención IVA',
      calculation_type: 'business_days_after',
      days_value: 10,
      reference_period: 'next_month',
      consider_holidays: true,
    },
    {
      tax_type: 'retenciones_isr',
      tax_label: 'Retención ISR',
      calculation_type: 'business_days_after',
      days_value: 10,
      reference_period: 'next_month',
      consider_holidays: true,
    },
  ];
}

// ─── Próximos vencimientos (Dashboard) ─────────────────────────────────────

/** Solo se avisa de los vencimientos a esta cantidad de días o menos. */
export const DEADLINE_WINDOW_DAYS = 30;
/** Un vencimiento sin presentar deja de mostrarse pasados estos días. */
export const OVERDUE_LOOKBACK_DAYS = 60;

/**
 * Coincidencia del texto libre tax_type de tab_tax_forms con el tax_type de la
 * configuración: lista de alternativas (OR); cada alternativa, tokens que deben
 * aparecer todos (AND). Texto normalizado sin acentos y en minúsculas.
 */
export const TAX_TYPE_MATCHERS: Record<string, string[][]> = {
  iva: [['iva']],
  iva_mensual: [['iva']],
  isr_mensual: [['isr']],
  // "ISR ANUAL" no debe contar como el trimestral.
  isr_trimestral: [['isr', 'trim'], ['renta', 'trim']],
  // Nombre oficial de la SAT: "IMPUESTO DE SOLIDARIDAD".
  iso: [['iso'], ['solidaridad']],
  iso_trimestral: [['iso'], ['solidaridad']],
  retencion_iva: [['ret', 'iva']],
  retenciones_iva: [['ret', 'iva']],
  retencion_isr: [['ret', 'isr']],
  retenciones_isr: [['ret', 'isr']],
  isr_anual: [['isr', 'anual']],
};

const normalizeText = (v: string) =>
  v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** ¿El formulario (tax_type libre) corresponde al impuesto de la configuración? */
export function taxFormMatchesConfig(formTaxType: string | null | undefined, configTaxType: string): boolean {
  if (!formTaxType) return false;
  const normalized = normalizeText(formTaxType);
  const alternatives = TAX_TYPE_MATCHERS[configTaxType] ?? [[configTaxType.toLowerCase()]];
  return alternatives.some((tokens) => tokens.every((token) => normalized.includes(token)));
}

/** Configuración de impuesto trimestral (vence el mes siguiente al cierre del trimestre). */
export function isQuarterlyConfig(config: Pick<TaxDueDateConfig, 'reference_period'>): boolean {
  return config.reference_period === 'quarter_end_next_month';
}

/**
 * Período que cubre un vencimiento. En los trimestrales, periodMonth es el mes de
 * INICIO del trimestre (1, 4, 7, 10), igual que en tab_tax_forms.
 */
export function coveredPeriodForDueDate(
  config: Pick<TaxDueDateConfig, 'reference_period'>,
  dueDate: Date,
): { periodMonth: number; periodYear: number } {
  const { periodMonth, periodYear } = derivePeriodCovered(dueDate);
  if (!isQuarterlyConfig(config)) return { periodMonth, periodYear };
  return { periodMonth: Math.floor((periodMonth - 1) / 3) * 3 + 1, periodYear };
}

export interface PresentedTaxForm {
  tax_type: string | null;
  period_month: number | null;
  period_year: number | null;
  period_type?: string | null;
}

/** ¿Ya se presentó el formulario de ese impuesto y período? */
export function isFormPresented(
  form: PresentedTaxForm,
  config: Pick<TaxDueDateConfig, 'tax_type' | 'reference_period'>,
  covered: { periodMonth: number; periodYear: number },
): boolean {
  if (!taxFormMatchesConfig(form.tax_type, config.tax_type)) return false;
  if (form.period_year !== covered.periodYear || form.period_month == null) return false;
  if (isQuarterlyConfig(config)) {
    const periodType = normalizeText(form.period_type ?? '');
    if (periodType === 'anual' || periodType === 'mensual') return false;
    return form.period_month >= covered.periodMonth && form.period_month <= covered.periodMonth + 2;
  }
  return form.period_month === covered.periodMonth;
}

export interface PendingDeadline {
  label: string;
  taxType: string;
  dueDate: Date;
  daysUntil: number;
  isOverdue: boolean;
  /** 0 a 3 días. */
  isUrgent: boolean;
  /** 4 a 7 días. */
  isImportant: boolean;
  /** "Septiembre 2026" o "Julio - Septiembre 2026". */
  periodLabel: string;
}

/** Etiqueta del período cubierto. */
export function periodLabelFor(
  config: Pick<TaxDueDateConfig, 'reference_period'>,
  covered: { periodMonth: number; periodYear: number },
): string {
  if (isQuarterlyConfig(config)) {
    return `${MONTH_NAMES_ES[covered.periodMonth]} - ${MONTH_NAMES_ES[covered.periodMonth + 2]} ${covered.periodYear}`;
  }
  return `${MONTH_NAMES_ES[covered.periodMonth]} ${covered.periodYear}`;
}

/** ¿La vigencia de la config cubre el período (mes, o trimestre completo si es trimestral)? */
function isConfigValidForCovered(
  config: TaxDueDateConfig,
  covered: { periodMonth: number; periodYear: number },
): boolean {
  return isQuarterlyConfig(config)
    ? isTaxConfigValidForRange(config, covered.periodYear, covered.periodMonth, covered.periodMonth + 2)
    : isTaxConfigValidForMonth(config, covered.periodYear, covered.periodMonth);
}

/**
 * Vencimientos pendientes por impuesto: para cada configuración activa se calculan
 * los vencimientos de los meses ancla −4…+4 alrededor de `today`, se descartan los ya
 * presentados y los vencidos hace más de `lookbackDays`, y se toma el más próximo.
 * inWindow = vencidos o a `windowDays` días o menos (vencidos primero, el más vencido
 * antes; luego por fecha); next = el resto por fecha.
 */
export function computePendingDeadlines({
  configs,
  holidays,
  forms,
  today,
  windowDays = DEADLINE_WINDOW_DAYS,
  lookbackDays = OVERDUE_LOOKBACK_DAYS,
}: {
  configs: TaxDueDateConfig[];
  holidays: Date[];
  forms: PresentedTaxForm[];
  today: Date;
  windowDays?: number;
  lookbackDays?: number;
}): { inWindow: PendingDeadline[]; next: PendingDeadline[] } {
  const pending: PendingDeadline[] = [];

  for (const config of configs) {
    if (!config.is_active) continue;
    const seen = new Set<string>();
    let best: PendingDeadline | null = null;
    for (let k = -4; k <= 4; k++) {
      const anchor = new Date(today.getFullYear(), today.getMonth() + k, 1);
      const dueDate = calculateDueDate(anchor, config, holidays);
      const key = toDateOnlyString(dueDate);
      if (seen.has(key)) continue;
      seen.add(key);

      const daysUntil = getDaysUntil(dueDate, today);
      if (daysUntil < -lookbackDays) continue;
      const covered = coveredPeriodForDueDate(config, dueDate);
      // Vigencia: el vencimiento solo cuenta si la config aplica al período que cubre
      // (p. ej. vigente hasta 30/04: cuenta el que cubre abril, que se paga en mayo).
      if (!isConfigValidForCovered(config, covered)) continue;
      if (forms.some((f) => isFormPresented(f, config, covered))) continue;

      if (!best || dueDate.getTime() < best.dueDate.getTime()) {
        best = {
          label: config.tax_label,
          taxType: config.tax_type,
          dueDate,
          daysUntil,
          isOverdue: daysUntil < 0,
          isUrgent: daysUntil >= 0 && daysUntil <= 3,
          isImportant: daysUntil >= 4 && daysUntil <= 7,
          periodLabel: periodLabelFor(config, covered),
        };
      }
    }
    if (best) pending.push(best);
  }

  const byDate = (a: PendingDeadline, b: PendingDeadline) =>
    a.dueDate.getTime() - b.dueDate.getTime() || a.label.localeCompare(b.label, 'es');
  const inWindow = pending
    .filter((d) => d.isOverdue || d.daysUntil <= windowDays)
    .sort((a, b) => (a.isOverdue === b.isOverdue ? byDate(a, b) : a.isOverdue ? -1 : 1));
  const next = pending.filter((d) => !d.isOverdue && d.daysUntil > windowDays).sort(byDate);
  return { inWindow, next };
}

export interface DueDateAlert {
  taxType: string;
  label: string;
  dueDate: Date;
  daysUntil: number;
  priority: 'urgente' | 'importante' | 'informativa';
  /** "Septiembre 2026" o "Julio - Septiembre 2026". */
  periodLabel: string;
}

/**
 * Alertas de vencimiento: para cada configuración activa se revisan los vencimientos
 * de los meses ancla −4…+4 alrededor de `today` (sin repetir fechas). Hay una alerta
 * por (impuesto, fecha) si la vigencia cubre el período, el formulario de ese período
 * no se ha presentado, la alerta del tipo está habilitada y faltan entre −1 y
 * `days_before` días.
 */
export function computeDueDateAlerts({
  configs,
  holidays,
  forms,
  today,
  alertConfigFor,
}: {
  configs: TaxDueDateConfig[];
  holidays: Date[];
  forms: PresentedTaxForm[];
  today: Date;
  alertConfigFor: (taxType: string) => { is_enabled: boolean; days_before: number };
}): DueDateAlert[] {
  const alerts: DueDateAlert[] = [];
  for (const config of configs) {
    if (!config.is_active) continue;
    const alertConfig = alertConfigFor(config.tax_type);
    if (!alertConfig.is_enabled) continue;
    const seen = new Set<string>();
    for (let k = -4; k <= 4; k++) {
      const anchor = new Date(today.getFullYear(), today.getMonth() + k, 1);
      const dueDate = calculateDueDate(anchor, config, holidays);
      const key = toDateOnlyString(dueDate);
      if (seen.has(key)) continue;
      seen.add(key);

      const daysUntil = getDaysUntil(dueDate, today);
      if (daysUntil > alertConfig.days_before || daysUntil < -1) continue;
      const covered = coveredPeriodForDueDate(config, dueDate);
      if (!isConfigValidForCovered(config, covered)) continue;
      if (forms.some((f) => isFormPresented(f, config, covered))) continue;

      alerts.push({
        taxType: config.tax_type,
        label: config.tax_label,
        dueDate,
        daysUntil,
        priority: getPriorityFromDays(daysUntil),
        periodLabel: periodLabelFor(config, covered),
      });
    }
  }
  return alerts.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
}

/**
 * ¿Sobra una alerta de vencimiento ya creada ('vencimiento_<tax_type>' con
 * event_date = fecha límite)? Sí si el formulario del período que cubre ya se
 * presentó, la config no existe o no está activa, su vigencia ya no cubre ese
 * período, o la fecha límite pasó hace más de `staleDays` días.
 */
export function isTaxAlertStale({
  notificationType,
  eventDate,
  configs,
  forms,
  today,
  staleDays = OVERDUE_LOOKBACK_DAYS,
}: {
  notificationType: string;
  eventDate: string | null;
  configs: TaxDueDateConfig[];
  forms: PresentedTaxForm[];
  today: Date;
  staleDays?: number;
}): boolean {
  const taxType = notificationType.startsWith('vencimiento_')
    ? notificationType.slice('vencimiento_'.length)
    : notificationType;
  const config = configs.find((c) => c.tax_type === taxType && c.is_active);
  if (!config) return true;
  if (!eventDate) return false;
  const dueDate = parseDateOnly(eventDate.slice(0, 10));
  const covered = coveredPeriodForDueDate(config, dueDate);
  if (forms.some((f) => isFormPresented(f, config, covered))) return true;
  if (!isConfigValidForCovered(config, covered)) return true;
  return getDaysUntil(dueDate, today) < -staleDays;
}

/**
 * Feriados del año anterior, el actual y el siguiente (los recurrentes se repiten en
 * cada uno): un vencimiento de enero del año siguiente también respeta los feriados.
 */
export function parseHolidaysForYears(holidays: Holiday[], year: number): Date[] {
  return [
    ...parseHolidays(holidays, year - 1),
    ...parseHolidays(holidays, year),
    ...parseHolidays(holidays, year + 1),
  ];
}

/**
 * Une etiquetas en español: "A y B" ("A e B" si B empieza con sonido i), o "A, B, C"
 * con tres o más.
 */
export function joinLabelsEs(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  if (labels.length === 2) {
    const second = normalizeText(labels[1]);
    const conj = /^(i|hi)/.test(second) && !/^(hie|hia)/.test(second) ? 'e' : 'y';
    return `${labels[0]} ${conj} ${labels[1]}`;
  }
  return labels.join(', ');
}

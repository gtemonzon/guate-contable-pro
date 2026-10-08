/**
 * Reglas de vencimiento (tab_tax_due_date_config): texto de la regla, validación de
 * las filas y plan de guardado. Funciones puras, sin acceso a la base.
 */
import { isValidityRangeOk } from './taxConfigValidity';

export interface DueDateRuleInput {
  calculation_type: string;
  days_value: number | null | undefined;
  reference_period: string;
}

const REFERENCE_TEXT: Record<string, string> = {
  current_month: 'del mes',
  next_month: 'del mes siguiente al período',
  quarter_end_next_month: 'del mes siguiente al trimestre',
};

/**
 * Texto de la regla: "Último día hábil del mes siguiente al trimestre",
 * "10 días hábiles del mes siguiente al período", "Día 31 del mes siguiente al
 * período". Valores desconocidos se muestran tal cual. Quien llama agrega
 * " (considera días feriados)" si corresponde.
 */
export function describeDueDateRule(config: DueDateRuleInput): string {
  const days = Number(config.days_value ?? 0);
  let base: string;
  switch (config.calculation_type) {
    case 'last_business_day':
      base = 'Último día hábil';
      break;
    case 'business_days_after':
      base = days === 1 ? '1 día hábil' : `${days} días hábiles`;
      break;
    case 'fixed_day':
      base = `Día ${days}`;
      break;
    default:
      base = String(config.calculation_type ?? '');
  }
  const reference = REFERENCE_TEXT[config.reference_period] ?? String(config.reference_period ?? '');
  return [base, reference].filter(Boolean).join(' ');
}

export interface DueDateRow extends DueDateRuleInput {
  tax_type: string;
  tax_label: string;
  consider_holidays: boolean;
  is_active: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
}

export interface DueDateRowError {
  /** Índice de la fila en la lista. */
  index: number;
  tax_type: string;
  messages: string[];
}

/**
 * Errores por fila: etiqueta vacía, tax_type repetido, día fijo fuera de 1–31, días
 * hábiles fuera de 1–31 y vigencia con "Hasta" anterior a "Desde" (solo filas
 * activas: en las inactivas la vigencia no se muestra ni se puede corregir).
 */
export function validateDueDateRows(rows: readonly DueDateRow[]): DueDateRowError[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.tax_type, (counts.get(r.tax_type) ?? 0) + 1);

  const errors: DueDateRowError[] = [];
  rows.forEach((row, index) => {
    const messages: string[] = [];
    if (!String(row.tax_label ?? '').trim()) messages.push('La etiqueta no puede estar vacía');
    if ((counts.get(row.tax_type) ?? 0) > 1) messages.push('Impuesto repetido');
    const days = Number(row.days_value);
    const daysInRange = Number.isInteger(days) && days >= 1 && days <= 31;
    if (row.calculation_type === 'fixed_day' && !daysInRange) {
      messages.push('El día fijo debe estar entre 1 y 31');
    }
    if (row.calculation_type === 'business_days_after' && !daysInRange) {
      messages.push('Los días hábiles deben estar entre 1 y 31');
    }
    if (row.is_active && !isValidityRangeOk(row)) {
      messages.push('"Hasta" no puede ser anterior a "Vigente desde"');
    }
    if (messages.length > 0) errors.push({ index, tax_type: row.tax_type, messages });
  });
  return errors;
}

/**
 * Plan de guardado: las filas a escribir (upsert por enterprise_id + tax_type) con
 * display_order = índice + 1, y los tax_type que existían en la base y ya no están.
 */
export function planDueDateSave<T extends { tax_type: string }>(
  existingTaxTypes: readonly string[],
  rows: readonly T[],
): { upserts: Array<T & { display_order: number }>; removedTypes: string[] } {
  const kept = new Set(rows.map((r) => r.tax_type));
  return {
    upserts: rows.map((r, i) => ({ ...r, display_order: i + 1 })),
    removedTypes: [...new Set(existingTaxTypes)].filter((t) => !kept.has(t)),
  };
}

/** ¿El error de Supabase es de permisos (RLS / 42501)? */
export function isPermissionError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42501') return true;
  return /row[- ]level security|permission denied/i.test(error.message ?? '');
}

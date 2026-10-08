/**
 * ISR Trimestral del Dashboard: el trimestre pendiente de declarar (el último trimestre
 * terminado) con el cálculo guardado del Generador de Declaraciones, o el formulario
 * ya presentado.
 */
import type { IsrTrimestralResultFields } from "./declarationCalculations";
import type { SavedCalcMeta } from "./dashboardIvaSummary";
import { getDaysUntil } from "./dueDateCalculations";

export interface QuarterRef {
  quarter: number;
  year: number;
  /** Mes de inicio (1, 4, 7, 10). */
  startMonth: number;
  /** Mes de fin (3, 6, 9, 12). */
  endMonth: number;
}

/**
 * Último trimestre terminado (el que se declara): ene–mar → T4 del año anterior;
 * abr–jun → T1; jul–sep → T2; oct–dic → T3.
 */
export function lastCompletedQuarter(today: Date): QuarterRef {
  const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
  const quarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const year = currentQuarter === 1 ? today.getFullYear() - 1 : today.getFullYear();
  const startMonth = (quarter - 1) * 3 + 1;
  return { quarter, year, startMonth, endMonth: startMonth + 2 };
}

export interface IsrTrimestralFormRow {
  tax_type: string | null;
  period_type?: string | null;
  period_month: number | null;
  period_year: number | null;
  form_number: string;
  amount_paid: number | string | null;
  payment_date: string | null;
  is_active?: boolean | null;
}

export interface PresentedIsrTrimestralForm {
  formNumber: string;
  amountPaid: number;
  paymentDate: string | null;
}

const normalize = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Formulario ISR trimestral activo del trimestre: tipo con "isr" y "trim" (no "ISR
 * ANUAL" ni "ISR MENSUAL"), mismo año y period_month dentro del trimestre (los
 * formularios guardan el mes de inicio).
 */
export function findPresentedIsrTrimestralForm(
  forms: readonly IsrTrimestralFormRow[],
  year: number,
  startMonth: number,
): PresentedIsrTrimestralForm | null {
  const form = forms.find((f) => {
    if (f.is_active === false) return false;
    const type = normalize(f.tax_type ?? "");
    if (!type.includes("isr") || !type.includes("trim")) return false;
    if (f.period_year !== year || f.period_month == null) return false;
    return f.period_month >= startMonth && f.period_month <= startMonth + 2;
  });
  if (!form) return null;
  return {
    formNumber: form.form_number,
    amountPaid: Number(form.amount_paid) || 0,
    paymentDate: form.payment_date,
  };
}

export interface IsrTrimestralSummary {
  state: "presented" | "pending";
  hasSaved: boolean;
  ingresos: number;
  costoVentas: number;
  gastosOperacion: number;
  rentaImponible: number;
  isrCalculado: number;
  isrPagadoAnterior: number;
  isrAPagar: number;
  rate: number;
  savedAt: string | null;
  savedCalcId: number | null;
  dueDate: Date | null;
  daysUntil: number | null;
  isOverdue: boolean;
  presentedForm: PresentedIsrTrimestralForm | null;
}

export function buildIsrTrimestralSummary({
  saved,
  presentedForm,
  dueDate,
  today,
  rate,
}: {
  /** Trimestre del resumen (informativo; las fechas ya vienen resueltas). */
  quarter: QuarterRef;
  saved: (SavedCalcMeta & IsrTrimestralResultFields) | null;
  presentedForm: PresentedIsrTrimestralForm | null;
  dueDate: Date | null;
  today: Date;
  /** Tasa de la configuración ISR_TRIMESTRAL (si no hay cálculo guardado). */
  rate: number;
}): IsrTrimestralSummary {
  const daysUntil = dueDate ? getDaysUntil(dueDate, today) : null;
  return {
    state: presentedForm ? "presented" : "pending",
    hasSaved: !!saved,
    ingresos: saved?.ingresos ?? 0,
    costoVentas: saved?.costoVentas ?? 0,
    gastosOperacion: saved?.gastosOperacion ?? 0,
    rentaImponible: saved?.rentaImponible ?? 0,
    isrCalculado: saved?.isrCalculado ?? 0,
    isrPagadoAnterior: saved?.isrPagadoAnterior ?? 0,
    isrAPagar: saved?.isrAPagar ?? 0,
    rate: saved && saved.tasaImpuesto > 0 ? saved.tasaImpuesto : rate,
    savedAt: saved?.createdAt ?? null,
    savedCalcId: saved?.id ?? null,
    dueDate,
    daysUntil,
    isOverdue: daysUntil !== null && daysUntil < 0,
    presentedForm,
  };
}

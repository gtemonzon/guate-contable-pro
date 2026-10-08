/**
 * Formularios ya presentados (tab_tax_forms) para el Dashboard: un impuesto con
 * formulario registrado deja de contar como "pendiente de pago".
 */

export interface PresentedFormRow {
  id?: number | null;
  tax_type: string | null;
  period_type?: string | null;
  period_month: number | null;
  period_year: number | null;
  form_number: string;
  amount_paid: number | string | null;
  payment_date: string | null;
  is_active?: boolean | null;
}

export interface PresentedFormInfo {
  formNumber: string;
  amountPaid: number;
  paymentDate: string | null;
}

const normalize = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿El tax_type libre corresponde al impuesto mensual buscado? */
function matchesKind(taxType: string, kind: "IVA" | "ISR_MENSUAL"): boolean {
  const t = normalize(taxType);
  if (t.includes("retenc")) return false;
  if (kind === "IVA") return t.includes("iva");
  return t.includes("isr") && !t.includes("anual") && !t.includes("trim");
}

/**
 * Formulario mensual presentado del período (IVA o ISR mensual). Cuenta si está
 * activo, es del mismo año y mes y su period_type no es trimestral ni anual. Con
 * varios, el más reciente (payment_date descendente, luego id).
 */
export function findPresentedMonthlyForm(
  forms: readonly PresentedFormRow[],
  kind: "IVA" | "ISR_MENSUAL",
  year: number,
  month: number,
): PresentedFormInfo | null {
  const matches = forms.filter((f) => {
    if (f.is_active === false) return false;
    if (f.period_year !== year || f.period_month !== month) return false;
    const periodType = normalize(f.period_type ?? "");
    if (periodType === "trimestral" || periodType === "anual") return false;
    return matchesKind(f.tax_type ?? "", kind);
  });
  if (matches.length === 0) return null;
  const latest = [...matches].sort((a, b) => {
    const byDate = (b.payment_date ?? "").localeCompare(a.payment_date ?? "");
    return byDate !== 0 ? byDate : (b.id ?? 0) - (a.id ?? 0);
  })[0];
  return {
    formNumber: latest.form_number,
    amountPaid: Number(latest.amount_paid) || 0,
    paymentDate: latest.payment_date,
  };
}

/** Total estimado del "Resumen de Impuestos": solo lo positivo y SIN lo ya presentado. */
export function computeTotalTaxEstimate(items: ReadonlyArray<{ amount: number; presented?: PresentedFormInfo | null }>): number {
  return items.reduce((s, t) => (t.presented ? s : s + Math.max(0, t.amount)), 0);
}

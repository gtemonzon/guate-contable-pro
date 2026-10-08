/**
 * Vigencia por fechas de la configuración de impuestos (tab_enterprise_tax_config y
 * tab_tax_due_date_config). Una configuración aplica si is_active y el período se cruza
 * con [effective_from, effective_to]; NULL en un extremo = sin límite.
 *
 * Fechas 'YYYY-MM-DD' comparadas como texto (orden lexicográfico = cronológico), sin
 * convertir a Date, para no depender de la zona horaria.
 */

export interface TaxConfigValidity {
  is_active: boolean | null | undefined;
  effective_from?: string | null;
  effective_to?: string | null;
}

const toIso = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const firstDay = (year: number, month: number) => `${year}-${pad(month)}-01`;
const lastDay = (year: number, month: number) =>
  `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

/** ¿La vigencia [from, to] se cruza con [start, end]? */
function overlaps(cfg: TaxConfigValidity, start: string, end: string): boolean {
  if (!cfg.is_active) return false;
  const from = toIso(cfg.effective_from);
  const to = toIso(cfg.effective_to);
  if (from && from > end) return false;
  if (to && to < start) return false;
  return true;
}

/** ¿La configuración aplica al mes (year, month)? */
export function isTaxConfigValidForMonth(cfg: TaxConfigValidity, year: number, month: number): boolean {
  return overlaps(cfg, firstDay(year, month), lastDay(year, month));
}

/** ¿La configuración aplica a algún mes del rango (p. ej. un trimestre)? */
export function isTaxConfigValidForRange(
  cfg: TaxConfigValidity,
  year: number,
  startMonth: number,
  endMonth: number,
): boolean {
  return overlaps(cfg, firstDay(year, startMonth), lastDay(year, endMonth));
}

/** ¿La configuración aplica en la fecha (Date local o 'YYYY-MM-DD')? */
export function isTaxConfigValidOn(cfg: TaxConfigValidity, date: Date | string): boolean {
  const iso = typeof date === "string"
    ? toIso(date)
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!iso) return false;
  return overlaps(cfg, iso, iso);
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
const dmy = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

/** "Sin límite", "Desde 01/05/2026", "Hasta 30/04/2026" o "01/01/2026 – 30/04/2026". */
export function describeValidity(cfg: Pick<TaxConfigValidity, "effective_from" | "effective_to">): string {
  const from = toIso(cfg.effective_from);
  const to = toIso(cfg.effective_to);
  if (from && to) return `${dmy(from)} – ${dmy(to)}`;
  if (from) return `Desde ${dmy(from)}`;
  if (to) return `Hasta ${dmy(to)}`;
  return "Sin límite";
}

/** Rango coherente: sin "Hasta" anterior a "Desde". */
export function isValidityRangeOk(cfg: Pick<TaxConfigValidity, "effective_from" | "effective_to">): boolean {
  const from = toIso(cfg.effective_from);
  const to = toIso(cfg.effective_to);
  return !from || !to || to >= from;
}

// ─── Por tipo de formulario (tab_enterprise_tax_config) ─────────────────────

/** Formularios trimestrales: su vigencia se evalúa sobre el trimestre. */
export const QUARTERLY_FORM_TYPES = ["ISR_TRIMESTRAL", "ISO_TRIMESTRAL"];

export interface FormTaxConfig extends TaxConfigValidity {
  tax_form_type: string;
}

const quarterRangeOf = (month: number) => {
  const start = Math.floor((month - 1) / 3) * 3 + 1;
  return { start, end: start + 2 };
};

/**
 * ¿La configuración aplica al período del mes (year, month)? Mensuales: ese mes;
 * trimestrales: el trimestre que contiene ese mes.
 */
export function isFormConfigValidForPeriod(cfg: FormTaxConfig, year: number, month: number): boolean {
  if (QUARTERLY_FORM_TYPES.includes(cfg.tax_form_type)) {
    const { start, end } = quarterRangeOf(month);
    return isTaxConfigValidForRange(cfg, year, start, end);
  }
  return isTaxConfigValidForMonth(cfg, year, month);
}

/** Tipos de formulario con configuración vigente en el período, en el orden de `configs`. */
export function validFormTypesForPeriod(configs: readonly FormTaxConfig[], year: number, month: number): string[] {
  const types: string[] = [];
  for (const c of configs) {
    if (isFormConfigValidForPeriod(c, year, month) && !types.includes(c.tax_form_type)) types.push(c.tax_form_type);
  }
  return types;
}

/**
 * Vigencia para el Dashboard ("hoy"): los mensuales se evalúan en el mes anterior
 * (el que se declara); los trimestrales, en el último trimestre terminado.
 */
export function isFormConfigValidForDashboard(cfg: FormTaxConfig, today: Date): boolean {
  if (QUARTERLY_FORM_TYPES.includes(cfg.tax_form_type)) {
    const currentQuarter = Math.floor(today.getMonth() / 3) + 1;
    const quarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
    const year = currentQuarter === 1 ? today.getFullYear() - 1 : today.getFullYear();
    const start = (quarter - 1) * 3 + 1;
    return isTaxConfigValidForRange(cfg, year, start, start + 2);
  }
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return isTaxConfigValidForMonth(cfg, prev.getFullYear(), prev.getMonth() + 1);
}

/**
 * Tipo de formulario a preseleccionar en el Generador (sin elección manual):
 * se conserva el actual si sigue vigente y no es de IVA; si no (o si es de IVA),
 * el IVA del régimen si está vigente; si no, el actual si está vigente; si no, el
 * primero vigente; sin ninguno, null.
 */
export function chooseAutoFormType({
  current,
  validTypes,
  regimeFormType,
}: {
  current: string | null;
  validTypes: readonly string[];
  regimeFormType: string | null;
}): string | null {
  const isIva = current === "IVA_GENERAL" || current === "IVA_PEQUENO";
  if (current && !isIva && validTypes.includes(current)) return current;
  if (regimeFormType && validTypes.includes(regimeFormType)) return regimeFormType;
  if (current && validTypes.includes(current)) return current;
  return validTypes[0] ?? null;
}

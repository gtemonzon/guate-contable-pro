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

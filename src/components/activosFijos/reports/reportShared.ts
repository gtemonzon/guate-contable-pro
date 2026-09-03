/**
 * Cálculos y utilidades puras compartidas por los 4 reportes de Activos Fijos.
 * Sin dependencias de React/Supabase — solo lógica de fechas y depreciación.
 */

export const MONTH_NAMES = [
  "",
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export function fmt(n: number): string {
  return n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDateEs(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("es-GT");
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateParts(dateStr: string): DateParts {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

export function periodKey(year: number, month: number): number {
  return year * 12 + month;
}

export interface DepreciationRow {
  year: number;
  month: number;
  planned_depreciation_amount: number;
}

/** Suma depreciación con (year,month) <= (cutoffYear,cutoffMonth), sin importar status. */
export function sumDepreciationUpTo(
  rows: DepreciationRow[],
  cutoffYear: number,
  cutoffMonth: number,
): number {
  const cutoffKey = periodKey(cutoffYear, cutoffMonth);
  return rows.reduce(
    (sum, r) => (periodKey(r.year, r.month) <= cutoffKey ? sum + r.planned_depreciation_amount : sum),
    0,
  );
}

/** Suma depreciación con (year,month) estrictamente antes de (year,month), sin importar status. */
export function sumDepreciationBefore(rows: DepreciationRow[], year: number, month: number): number {
  const key = periodKey(year, month);
  return rows.reduce(
    (sum, r) => (periodKey(r.year, r.month) < key ? sum + r.planned_depreciation_amount : sum),
    0,
  );
}

/** Suma depreciación con (year,month) dentro de [inicio, fin], ambos inclusive. */
export function sumDepreciationWithin(
  rows: DepreciationRow[],
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): number {
  const startKey = periodKey(startYear, startMonth);
  const endKey = periodKey(endYear, endMonth);
  return rows.reduce((sum, r) => {
    const k = periodKey(r.year, r.month);
    return k >= startKey && k <= endKey ? sum + r.planned_depreciation_amount : sum;
  }, 0);
}

export interface AssetPresenceInput {
  acquisition_date: string;
  disposed_at: string | null;
}

/**
 * Activo presente (no dado de baja) exactamente a una fecha de corte:
 * acquisition_date <= corte Y (disposed_at es null O disposed_at > corte).
 */
export function isPresentAsOf(asset: AssetPresenceInput, asOfDate: string): boolean {
  if (asset.acquisition_date > asOfDate) return false;
  if (!asset.disposed_at) return true;
  const cutoff = new Date(`${asOfDate}T00:00:00.000Z`).getTime();
  const disposedAt = new Date(asset.disposed_at).getTime();
  return disposedAt > cutoff;
}

/**
 * Activo presente al INICIO de un período (para "saldo inicial"):
 * acquisition_date < inicio Y (disposed_at es null O su fecha >= inicio).
 */
export function isPresentAtStart(asset: AssetPresenceInput, startDate: string): boolean {
  if (asset.acquisition_date >= startDate) return false;
  if (!asset.disposed_at) return true;
  return disposalDateOnly(asset.disposed_at) >= startDate;
}

/** Extrae la porción YYYY-MM-DD de un timestamp ISO de disposed_at. */
export function disposalDateOnly(disposedAt: string): string {
  return disposedAt.slice(0, 10);
}

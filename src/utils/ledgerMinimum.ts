/**
 * Mínimo para guardar una factura de Libros Fiscales en la base.
 *
 * Una fila solo se escribe en tab_purchase_ledger / tab_sales_ledger si tiene fecha,
 * número, NIT válido y total mayor a cero. Lo que no cumple el mínimo se queda en
 * pantalla (y, si es nueva, en el borrador local) hasta completarse.
 */
import { validateNIT } from "./nitValidation";

export type LedgerKind = "purchase" | "sale";

export interface LedgerMinimumRow {
  invoice_date?: string | null;
  invoice_number?: string | null;
  supplier_nit?: string | null;
  customer_nit?: string | null;
  total_amount?: number | string | null;
}

export interface LedgerMinimumResult {
  ok: boolean;
  /** Campos faltantes, en el orden en que aparecen en la tarjeta. */
  missing: string[];
}

/** ¿La fila tiene lo mínimo para guardarse? Compras usa supplier_nit; ventas customer_nit. */
export function isMinimallyComplete(row: LedgerMinimumRow, kind: LedgerKind): LedgerMinimumResult {
  const missing: string[] = [];
  if (!String(row.invoice_date ?? "").trim()) missing.push("fecha");
  if (!String(row.invoice_number ?? "").trim()) missing.push("número");

  const nit = String((kind === "purchase" ? row.supplier_nit : row.customer_nit) ?? "").trim();
  if (!nit) missing.push("NIT");
  else if (!validateNIT(nit)) missing.push("NIT válido");

  const total = Number(row.total_amount);
  if (!Number.isFinite(total) || total <= 0) missing.push("total");

  return { ok: missing.length === 0, missing };
}

/** Texto del aviso al intentar cerrar una fila incompleta. */
export function missingFieldsMessage(missing: string[]): string {
  return `Faltan: ${missing.join(", ")}`;
}

/** Valores de la fila tal como estaba guardada (nit = supplier_nit o customer_nit). */
export interface LedgerBaseline {
  invoice_date?: string | null;
  invoice_number?: string | null;
  nit?: string | null;
  total_amount?: number | string | null;
}

/** Baseline a partir de una fila (compras: supplier_nit; ventas: customer_nit). */
export function ledgerBaselineOf(row: LedgerMinimumRow, kind: LedgerKind): LedgerBaseline {
  return {
    invoice_date: row.invoice_date ?? null,
    invoice_number: row.invoice_number ?? null,
    nit: (kind === "purchase" ? row.supplier_nit : row.customer_nit) ?? null,
    total_amount: row.total_amount ?? null,
  };
}

const normText = (v: unknown) => String(v ?? "").trim();
const normNit = (v: unknown) => String(v ?? "").replace(/[-\s]/g, "").toUpperCase();
const normTotal = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Mínimo para una fila YA guardada: solo se valida lo que el usuario cambió respecto
 * al baseline. Así una factura histórica (NIT "VARIOS", total 0…) se puede editar en
 * otros campos, pero no se puede vaciar un dato ni cambiarlo por uno inválido.
 * Las filas nuevas siguen usando isMinimallyComplete.
 */
export function isMinimallyCompleteForEdit(
  current: LedgerMinimumRow,
  baseline: LedgerBaseline,
  kind: LedgerKind,
): LedgerMinimumResult {
  const missing: string[] = [];

  const date = normText(current.invoice_date);
  if (date !== normText(baseline.invoice_date) && !date) missing.push("fecha");

  const number = normText(current.invoice_number);
  if (number !== normText(baseline.invoice_number) && !number) missing.push("número");

  const rawNit = kind === "purchase" ? current.supplier_nit : current.customer_nit;
  const nit = normNit(rawNit);
  if (nit !== normNit(baseline.nit)) {
    if (!nit) missing.push("NIT");
    else if (!validateNIT(nit)) missing.push("NIT válido");
  }

  const total = normTotal(current.total_amount);
  if (total !== normTotal(baseline.total_amount) && !(total > 0)) missing.push("total");

  return { ok: missing.length === 0, missing };
}

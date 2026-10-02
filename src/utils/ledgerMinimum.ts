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

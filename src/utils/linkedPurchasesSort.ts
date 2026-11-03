/**
 * Orden de las compras vinculadas a una partida: por proveedor, fecha, serie y número.
 */

export interface LinkedPurchaseSortable {
  supplier_name: string | null;
  invoice_date: string;
  invoice_series: string | null;
  invoice_number: string;
}

const compareText = (a: string, b: string) =>
  a.localeCompare(b, "es", { sensitivity: "base", numeric: true });

/** Proveedor sin nombre (null o solo espacios): va al final. */
const supplierKey = (name: string | null): string | null => {
  const trimmed = (name ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * Copia ordenada (no muta `rows`): proveedor sin distinguir mayúsculas ni acentos,
 * sin nombre al final; luego fecha ascendente; luego serie (vacía primero) y número,
 * ambos con orden numérico ("2" antes que "10").
 */
export function sortLinkedPurchases<T extends LinkedPurchaseSortable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const supplierA = supplierKey(a.supplier_name);
    const supplierB = supplierKey(b.supplier_name);
    if (supplierA === null || supplierB === null) {
      if (supplierA !== supplierB) return supplierA === null ? 1 : -1;
    } else {
      const bySupplier = compareText(supplierA, supplierB);
      if (bySupplier !== 0) return bySupplier;
    }

    if (a.invoice_date !== b.invoice_date) return a.invoice_date < b.invoice_date ? -1 : 1;

    const bySeries = compareText((a.invoice_series ?? "").trim(), (b.invoice_series ?? "").trim());
    if (bySeries !== 0) return bySeries;

    return compareText(a.invoice_number, b.invoice_number);
  });
}

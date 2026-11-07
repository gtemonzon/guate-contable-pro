/**
 * Selección del importador de compras: totales de lo seleccionado, resumen en vivo,
 * filas de la lista (nuevas, ya cargadas, repetidas) y selección inicial.
 * Funciones puras (sin base de datos).
 */

/** Campos que usan el resumen y la lista. */
export interface ImportSelectionRecord {
  invoice_date: string;
  invoice_series?: string | null;
  invoice_number: string;
  supplier_nit: string;
  fel_document_type: string;
  total_amount: number;
  purchase_book_id: number;
}

/** Document types that subtract from totals (affects_total = -1) */
export const NEGATIVE_DOC_TYPES = new Set(["NCRE", "NABN"]);

export function computeSelectedTotal(
  records: Pick<ImportSelectionRecord, "fel_document_type" | "total_amount">[],
  selectedIndices: Set<number>,
): number {
  let total = 0;
  records.forEach((r, i) => {
    if (!selectedIndices.has(i)) return;
    const sign = NEGATIVE_DOC_TYPES.has(r.fel_document_type) ? -1 : 1;
    total += r.total_amount * sign;
  });
  return total;
}

const MONTH_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function computeSelectedPeriodSummary(
  records: Pick<ImportSelectionRecord, "invoice_date">[],
  selectedIndices: Set<number>,
): { period: string; count: number }[] {
  const map = new Map<string, number>();
  records.forEach((r, i) => {
    if (!selectedIndices.has(i)) return;
    const d = new Date(r.invoice_date + "T00:00:00");
    const key = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries()).map(([period, count]) => ({ period, count }));
}

export interface ImportSelectionSummary {
  /** Nuevas marcadas. */
  selectedCount: number;
  /** Total de nuevas (válidas). */
  newCount: number;
  /** Total de las nuevas marcadas (notas de crédito restan). */
  selectedTotal: number;
  /** Facturas del archivo que ya existen en el sistema. */
  loadedCount: number;
  /** Registros duplicados (los que se sobrescriben si se activa la opción). */
  duplicateCount: number;
  toOverwriteCount: number;
  /** Lo que se importará: nuevas marcadas + duplicados a sobrescribir. */
  toImportCount: number;
  byPeriod: { period: string; count: number }[];
}

export function summarizeImportSelection({
  records,
  selectedIndices,
  duplicateCount,
  loadedCount,
  overwriteDuplicates,
}: {
  records: Pick<ImportSelectionRecord, "invoice_date" | "fel_document_type" | "total_amount">[];
  selectedIndices: Set<number>;
  duplicateCount: number;
  loadedCount: number;
  overwriteDuplicates: boolean;
}): ImportSelectionSummary {
  const selectedCount = records.reduce((n, _r, i) => (selectedIndices.has(i) ? n + 1 : n), 0);
  const toOverwriteCount = overwriteDuplicates ? duplicateCount : 0;
  return {
    selectedCount,
    newCount: records.length,
    selectedTotal: computeSelectedTotal(records, selectedIndices),
    loadedCount,
    duplicateCount,
    toOverwriteCount,
    toImportCount: selectedCount + toOverwriteCount,
    byPeriod: computeSelectedPeriodSummary(records, selectedIndices),
  };
}

export type ImportListRowStatus = "new" | "loaded" | "repeated";

export interface ImportListRow<T> {
  key: string;
  status: ImportListRowStatus;
  /** Índice en validRecords (solo filas "new"). */
  validIndex?: number;
  record: T;
}

type DuplicateKeyFields = Pick<
  ImportSelectionRecord,
  "supplier_nit" | "fel_document_type" | "invoice_series" | "invoice_number" | "purchase_book_id"
>;

const duplicateKey = (r: DuplicateKeyFields) =>
  `${r.supplier_nit}|${r.fel_document_type}|${r.invoice_series || ""}|${r.invoice_number}|${r.purchase_book_id}`;

const serieNumber = (r: Pick<ImportSelectionRecord, "invoice_series" | "invoice_number">) =>
  `${r.invoice_series || ""}-${r.invoice_number}`;

/**
 * Filas de la lista de selección, por fecha ascendente y luego serie-número:
 * "new" = cada registro válido (con su índice); de los duplicados, "loaded" si ya existe
 * en el sistema (coincide con existingDuplicates) y "repeated" si solo se repite dentro
 * del archivo.
 */
export function buildImportListRows<T extends ImportSelectionRecord>({
  validRecords,
  duplicateRecords,
  existingDuplicates,
}: {
  validRecords: T[];
  duplicateRecords: T[];
  existingDuplicates: DuplicateKeyFields[];
}): ImportListRow<T>[] {
  const existingKeys = new Set(existingDuplicates.map(duplicateKey));
  const rows: ImportListRow<T>[] = [
    ...validRecords.map((record, i) => ({ key: `new-${i}`, status: "new" as const, validIndex: i, record })),
    ...duplicateRecords.map((record, i) => ({
      key: `dup-${i}`,
      status: existingKeys.has(duplicateKey(record)) ? ("loaded" as const) : ("repeated" as const),
      record,
    })),
  ];
  return rows.sort((a, b) => {
    if (a.record.invoice_date !== b.record.invoice_date) return a.record.invoice_date < b.record.invoice_date ? -1 : 1;
    return serieNumber(a.record).localeCompare(serieNumber(b.record), "es", { numeric: true });
  });
}

/**
 * Selección inicial: en la primera importación (nada ya cargado) todas las nuevas;
 * al reimportar un archivo con facturas ya cargadas, ninguna (el usuario marca solo
 * las nuevas que quiere).
 */
export function initialSelection(validCount: number, loadedCount: number): Set<number> {
  if (loadedCount > 0) return new Set();
  return new Set(Array.from({ length: validCount }, (_, i) => i));
}

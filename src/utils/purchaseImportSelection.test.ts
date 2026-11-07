/**
 * Selección del importador de compras.
 * Run with: bunx vitest run src/utils/purchaseImportSelection.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  summarizeImportSelection,
  buildImportListRows,
  initialSelection,
  type ImportSelectionRecord,
} from "./purchaseImportSelection";

const rec = (over: Partial<ImportSelectionRecord> = {}): ImportSelectionRecord => ({
  invoice_date: "2026-10-05",
  invoice_series: "A",
  invoice_number: "1",
  supplier_nit: "123",
  fel_document_type: "FACT",
  total_amount: 100,
  purchase_book_id: 7,
  ...over,
});

describe("summarizeImportSelection", () => {
  const records = [
    rec({ total_amount: 500 }),
    rec({ total_amount: 80, fel_document_type: "NCRE" }),
    rec({ total_amount: 20, fel_document_type: "NABN" }),
    rec({ total_amount: 1000, invoice_date: "2026-11-02" }),
  ];

  it("notas de crédito restan y sin sobrescribir solo cuentan las nuevas", () => {
    const s = summarizeImportSelection({
      records, selectedIndices: new Set([0, 1, 2]), duplicateCount: 3, loadedCount: 2, overwriteDuplicates: false,
    });
    expect(s).toMatchObject({
      selectedCount: 3, newCount: 4, selectedTotal: 400, loadedCount: 2, duplicateCount: 3,
      toOverwriteCount: 0, toImportCount: 3,
    });
  });

  it("al sobrescribir suma todos los duplicados", () => {
    const s = summarizeImportSelection({
      records, selectedIndices: new Set([3]), duplicateCount: 3, loadedCount: 2, overwriteDuplicates: true,
    });
    expect(s).toMatchObject({ selectedCount: 1, selectedTotal: 1000, toOverwriteCount: 3, toImportCount: 4 });
  });

  it("byPeriod solo cuenta las seleccionadas", () => {
    const s = summarizeImportSelection({
      records, selectedIndices: new Set([0, 3]), duplicateCount: 0, loadedCount: 0, overwriteDuplicates: false,
    });
    expect(s.byPeriod).toEqual([{ period: "Oct 2026", count: 1 }, { period: "Nov 2026", count: 1 }]);
    expect(
      summarizeImportSelection({ records, selectedIndices: new Set(), duplicateCount: 0, loadedCount: 0, overwriteDuplicates: false }).byPeriod,
    ).toEqual([]);
  });
});

describe("buildImportListRows", () => {
  const validRecords = [
    rec({ invoice_date: "2026-10-09", invoice_number: "10" }),
    rec({ invoice_date: "2026-10-01", invoice_number: "5" }),
    rec({ invoice_date: "2026-10-09", invoice_number: "2" }),
  ];
  const loaded = rec({ invoice_date: "2026-10-03", invoice_number: "77", supplier_nit: "999" });
  const repeated = rec({ invoice_date: "2026-10-01", invoice_number: "6" });
  const existing = [{ ...loaded }];

  const rows = buildImportListRows({ validRecords, duplicateRecords: [loaded, repeated], existingDuplicates: existing });

  it("ordena por fecha y luego serie-número numérico", () => {
    expect(rows.map((r) => `${r.record.invoice_date} ${r.record.invoice_number}`)).toEqual([
      "2026-10-01 5", "2026-10-01 6", "2026-10-03 77", "2026-10-09 2", "2026-10-09 10",
    ]);
  });

  it("distingue ya cargadas de repetidas en el archivo", () => {
    expect(rows.find((r) => r.record === loaded)?.status).toBe("loaded");
    expect(rows.find((r) => r.record === repeated)?.status).toBe("repeated");
  });

  it("la llave incluye el libro de compras", () => {
    const otherBook = buildImportListRows({
      validRecords: [], duplicateRecords: [loaded], existingDuplicates: [{ ...loaded, purchase_book_id: 99 }],
    });
    expect(otherBook[0].status).toBe("repeated");
  });

  it("las nuevas llevan su índice en validRecords", () => {
    const news = rows.filter((r) => r.status === "new");
    expect(news.map((r) => [r.validIndex, r.record.invoice_number])).toEqual([[1, "5"], [2, "2"], [0, "10"]]);
    expect(rows.filter((r) => r.status !== "new").every((r) => r.validIndex === undefined)).toBe(true);
  });
});

describe("initialSelection", () => {
  it("primera importación: todas las nuevas", () => {
    expect([...initialSelection(3, 0)]).toEqual([0, 1, 2]);
  });
  it("reimportación con facturas ya cargadas: ninguna", () => {
    expect(initialSelection(3, 2).size).toBe(0);
  });
});

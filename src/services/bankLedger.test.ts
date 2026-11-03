/**
 * Libro de bancos: armado de filas y saldo acumulado.
 * Run with: bunx vitest run src/services/bankLedger.test.ts
 */
import { describe, it, expect, vi } from "vitest";

// Las funciones puras no consultan la base; se evita crear el cliente real.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  buildVoidConcept,
  mergeBankLedgerRows,
  withRunningBalance,
  type BankDocRow,
  type BankDocumentQueryRow,
  type BankMovementQueryRow,
} from "./bankLedger";

const doc = (over: Partial<BankDocumentQueryRow> = {}): BankDocumentQueryRow => ({
  document_date: "2026-10-05",
  document_number: "CH-100",
  beneficiary_name: "Proveedor A",
  concept: "Pago factura",
  void_date: null,
  void_reason: null,
  direction: "OUT",
  status: "ISSUED",
  journal_entry_id: 501,
  journal_entry: { entry_number: "PD-0001" },
  ...over,
});

const mov = (
  entry: Partial<NonNullable<BankMovementQueryRow["journal_entry"]>> = {},
  over: Partial<BankMovementQueryRow> = {},
): BankMovementQueryRow => ({
  debit_amount: 0,
  credit_amount: 0,
  description: "Línea",
  journal_entry: {
    id: 900,
    entry_number: "PD-0900",
    entry_date: "2026-10-10",
    description: "Partida",
    bank_reference: null,
    beneficiary_name: null,
    bank_direction: null,
    ...entry,
  },
  ...over,
});

describe("mergeBankLedgerRows", () => {
  it("un movimiento de una partida ya representada por un documento actualiza sus montos sin duplicar", () => {
    const rows = mergeBankLedgerRows(
      [doc()],
      [mov({ id: 501, entry_number: "PD-0001", entry_date: "2026-10-05" }, { debit_amount: 0, credit_amount: 1250.5 })],
      "ALL",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "document", document_number: "CH-100", debit: 0, credit: 1250.5 });
  });

  it("un movimiento sin documento agrega una fila journal; IN con debe y OUT con haber si no hay bank_direction", () => {
    const rows = mergeBankLedgerRows(
      [],
      [
        mov({ id: 1, entry_number: "PI-0001", entry_date: "2026-10-01", bank_reference: "DEP-9" }, { debit_amount: 300 }),
        mov({ id: 2, entry_number: "PE-0002", entry_date: "2026-10-02" }, { credit_amount: 80 }),
      ],
      "ALL",
    );
    expect(rows).toEqual<BankDocRow[]>([
      {
        date: "2026-10-01", document_number: "DEP-9", beneficiary: "", concept: "Partida", direction: "IN",
        debit: 300, credit: 0, status: "POSTED", journal_entry_number: "PI-0001", journal_entry_id: 1, source: "journal",
      },
      {
        date: "2026-10-02", document_number: "PE-0002", beneficiary: "", concept: "Partida", direction: "OUT",
        debit: 0, credit: 80, status: "POSTED", journal_entry_number: "PE-0002", journal_entry_id: 2, source: "journal",
      },
    ]);
  });

  it("respeta bank_direction cuando viene informado", () => {
    const [row] = mergeBankLedgerRows([], [mov({ bank_direction: "OUT" }, { debit_amount: 50 })], "ALL");
    expect(row.direction).toBe("OUT");
  });

  it("el documento VOID lleva el concepto de anulación y montos en 0", () => {
    const [row] = mergeBankLedgerRows(
      [doc({ status: "VOID", void_date: "2026-10-07", void_reason: "Error de monto", journal_entry: null, journal_entry_id: null })],
      [],
      "ALL",
    );
    expect(row).toMatchObject({ concept: "Pago factura — ANULADO el 07/10/2026: Error de monto", debit: 0, credit: 0 });
  });

  it("el filtro VOID excluye las filas POSTED de partidas", () => {
    const rows = mergeBankLedgerRows(
      [doc({ status: "VOID", journal_entry: null, journal_entry_id: null })],
      [mov({}, { debit_amount: 10 })],
      "VOID",
    );
    expect(rows.map((r) => r.status)).toEqual(["VOID"]);
  });

  it("ordena por fecha y luego por número de documento", () => {
    const rows = mergeBankLedgerRows(
      [
        doc({ document_date: "2026-10-09", document_number: "CH-200", journal_entry: null, journal_entry_id: null }),
        doc({ document_date: "2026-10-03", document_number: "CH-300", journal_entry: null, journal_entry_id: null }),
        doc({ document_date: "2026-10-09", document_number: "CH-150", journal_entry: null, journal_entry_id: null }),
      ],
      [mov({ entry_date: "2026-10-04", entry_number: "PD-1" }, { debit_amount: 5 })],
      "ALL",
    );
    expect(rows.map((r) => `${r.date} ${r.document_number}`)).toEqual([
      "2026-10-03 CH-300", "2026-10-04 PD-1", "2026-10-09 CH-150", "2026-10-09 CH-200",
    ]);
  });
});

describe("buildVoidConcept", () => {
  it("formato con fecha y motivo", () => {
    expect(buildVoidConcept("Pago renta", "2026-01-31", "Cheque dañado")).toBe("Pago renta — ANULADO el 31/01/2026: Cheque dañado");
  });
  it("quita el sufijo antiguo '— ANULADO: <motivo>'", () => {
    expect(buildVoidConcept("Pago renta — ANULADO: Cheque dañado", "2026-01-31", "Cheque dañado"))
      .toBe("Pago renta — ANULADO el 31/01/2026: Cheque dañado");
  });
  it("sin concepto, fecha ni motivo", () => {
    expect(buildVoidConcept(null, null, null)).toBe("ANULADO");
  });
});

describe("withRunningBalance", () => {
  it("acumula desde el saldo inicial", () => {
    const base = mergeBankLedgerRows(
      [],
      [
        mov({ id: 1, entry_number: "A", entry_date: "2026-10-01" }, { debit_amount: 100 }),
        mov({ id: 2, entry_number: "B", entry_date: "2026-10-02" }, { credit_amount: 30 }),
        mov({ id: 3, entry_number: "C", entry_date: "2026-10-03" }, { debit_amount: 5.5 }),
      ],
      "ALL",
    );
    expect(withRunningBalance(base, 1000).map((r) => r.runningBalance)).toEqual([1100, 1070, 1075.5]);
    expect(withRunningBalance([], 250)).toEqual([]);
  });
});

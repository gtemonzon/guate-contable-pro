/**
 * Orden de las compras vinculadas a una partida.
 * Run with: bunx vitest run src/utils/linkedPurchasesSort.test.ts
 */
import { describe, it, expect } from "vitest";
import { sortLinkedPurchases, type LinkedPurchaseSortable } from "./linkedPurchasesSort";

const p = (
  supplier_name: string | null,
  invoice_date: string,
  invoice_number: string,
  invoice_series: string | null = null,
): LinkedPurchaseSortable & { id: string } => ({
  id: `${supplier_name}|${invoice_date}|${invoice_series}|${invoice_number}`,
  supplier_name,
  invoice_date,
  invoice_series,
  invoice_number,
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("sortLinkedPurchases", () => {
  it("ordena por proveedor sin distinguir mayúsculas ni acentos", () => {
    const rows = [p("Zapata", "2026-01-01", "1"), p("alvarez", "2026-01-02", "1"), p("Álvarez", "2026-01-01", "1")];
    expect(ids(sortLinkedPurchases(rows))).toEqual([
      "Álvarez|2026-01-01|null|1",
      "alvarez|2026-01-02|null|1",
      "Zapata|2026-01-01|null|1",
    ]);
  });

  it("ignora espacios alrededor del nombre", () => {
    const rows = [p("  Beta ", "2026-01-01", "1"), p("Alfa", "2026-01-01", "1")];
    expect(sortLinkedPurchases(rows).map((r) => r.supplier_name)).toEqual(["Alfa", "  Beta "]);
  });

  it("mismo proveedor: por fecha ascendente", () => {
    const rows = [p("Acme", "2026-03-10", "1"), p("Acme", "2026-01-05", "1"), p("Acme", "2026-02-01", "1")];
    expect(sortLinkedPurchases(rows).map((r) => r.invoice_date)).toEqual(["2026-01-05", "2026-02-01", "2026-03-10"]);
  });

  it("misma fecha: serie (vacía primero) y número con orden numérico", () => {
    const rows = [
      p("Acme", "2026-01-01", "10", "B"),
      p("Acme", "2026-01-01", "2", "B"),
      p("Acme", "2026-01-01", "5", null),
      p("Acme", "2026-01-01", "1", "A"),
    ];
    expect(sortLinkedPurchases(rows).map((r) => `${r.invoice_series ?? ""}-${r.invoice_number}`)).toEqual([
      "-5", "A-1", "B-2", "B-10",
    ]);
  });

  it("proveedor nulo o vacío al final", () => {
    const rows = [p(null, "2026-01-01", "1"), p("Zapata", "2026-02-01", "1"), p("  ", "2026-01-01", "2")];
    expect(sortLinkedPurchases(rows).map((r) => r.supplier_name)).toEqual(["Zapata", null, "  "]);
  });

  it("no muta el arreglo original", () => {
    const rows = [p("Zapata", "2026-01-01", "1"), p("Acme", "2026-01-01", "1")];
    const before = [...rows];
    const sorted = sortLinkedPurchases(rows);
    expect(rows).toEqual(before);
    expect(sorted).not.toBe(rows);
  });
});

/**
 * Run with: bunx vitest run src/utils/ledgerMinimum.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { isMinimallyComplete, missingFieldsMessage } from "./ledgerMinimum";

const base = { invoice_date: "2026-10-05", invoice_number: "123", supplier_nit: "CF", total_amount: 100 };

describe("isMinimallyComplete", () => {
  it("fila completa (compras, NIT CF)", () => {
    expect(isMinimallyComplete(base, "purchase")).toEqual({ ok: true, missing: [] });
  });
  it("ventas usa customer_nit", () => {
    const sale = { invoice_date: "2026-10-05", invoice_number: "9", customer_nit: "cf", total_amount: 5 };
    expect(isMinimallyComplete(sale, "sale").ok).toBe(true);
    // supplier_nit no cuenta en ventas
    expect(isMinimallyComplete({ ...sale, customer_nit: "", supplier_nit: "CF" }, "sale").missing).toEqual(["NIT"]);
  });
  it("NIT inválido", () => {
    expect(isMinimallyComplete({ ...base, supplier_nit: "1234" }, "purchase").missing).toEqual(["NIT válido"]);
  });
  it("NIT válido con guion", () => {
    // 576937-K: dígito verificador K
    expect(isMinimallyComplete({ ...base, supplier_nit: "576937-K" }, "purchase").ok).toBe(true);
  });
  it("total 0 o vacío", () => {
    expect(isMinimallyComplete({ ...base, total_amount: 0 }, "purchase").missing).toEqual(["total"]);
    expect(isMinimallyComplete({ ...base, total_amount: null }, "purchase").missing).toEqual(["total"]);
  });
  it("número solo con espacios", () => {
    expect(isMinimallyComplete({ ...base, invoice_number: "   " }, "purchase").missing).toEqual(["número"]);
  });
  it("fila nueva vacía: lista todo lo que falta", () => {
    const r = isMinimallyComplete({ invoice_date: "2026-10-31", invoice_number: "", supplier_nit: "", total_amount: 0 }, "purchase");
    expect(r.ok).toBe(false);
    expect(missingFieldsMessage(r.missing)).toBe("Faltan: número, NIT, total");
  });
});

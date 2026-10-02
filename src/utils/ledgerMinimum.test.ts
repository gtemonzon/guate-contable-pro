/**
 * Run with: bunx vitest run src/utils/ledgerMinimum.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { isMinimallyComplete, isMinimallyCompleteForEdit, ledgerBaselineOf, missingFieldsMessage } from "./ledgerMinimum";

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

describe("isMinimallyCompleteForEdit (filas ya guardadas)", () => {
  const venta = { invoice_date: "2021-05-03", invoice_number: "77", customer_nit: "VARIOS", total_amount: 100 };
  const baseline = ledgerBaselineOf(venta, "sale");

  it("NIT VARIOS sin cambio => ok (solo se cambió la cuenta)", () => {
    expect(isMinimallyCompleteForEdit({ ...venta, income_account_id: 9 }, baseline, "sale")).toEqual({ ok: true, missing: [] });
  });
  it("NIT cambiado a ABC => NIT válido", () => {
    expect(isMinimallyCompleteForEdit({ ...venta, customer_nit: "ABC" }, baseline, "sale").missing).toEqual(["NIT válido"]);
  });
  it("NIT vaciado => NIT", () => {
    expect(isMinimallyCompleteForEdit({ ...venta, customer_nit: "  " }, baseline, "sale").missing).toEqual(["NIT"]);
  });
  it("NIT igual con otro formato (guiones/espacios/minúsculas) => sin cambio", () => {
    const b = ledgerBaselineOf({ ...venta, customer_nit: "576937-K" }, "sale");
    expect(isMinimallyCompleteForEdit({ ...venta, customer_nit: " 576937k" }, b, "sale").ok).toBe(true);
  });
  it("número vaciado => número", () => {
    expect(isMinimallyCompleteForEdit({ ...venta, invoice_number: " " }, baseline, "sale").missing).toEqual(["número"]);
  });
  it("fecha vaciada => fecha", () => {
    expect(isMinimallyCompleteForEdit({ ...venta, invoice_date: "" }, baseline, "sale").missing).toEqual(["fecha"]);
  });
  it("total 100 -> 0 => total", () => {
    expect(isMinimallyCompleteForEdit({ ...venta, total_amount: 0 }, baseline, "sale").missing).toEqual(["total"]);
    expect(isMinimallyCompleteForEdit({ ...venta, total_amount: null }, baseline, "sale").missing).toEqual(["total"]);
  });
  it("total 0 sin cambio => ok", () => {
    const cero = { ...venta, total_amount: 0 };
    expect(isMinimallyCompleteForEdit(cero, ledgerBaselineOf(cero, "sale"), "sale").ok).toBe(true);
  });
  it("baseline con C/F y cambio a NIT válido => ok", () => {
    const compra = { invoice_date: "2020-01-10", invoice_number: "5", supplier_nit: "C/F", total_amount: 50 };
    const b = ledgerBaselineOf(compra, "purchase");
    expect(isMinimallyCompleteForEdit({ ...compra, supplier_nit: "CF" }, b, "purchase").ok).toBe(true);
    expect(isMinimallyCompleteForEdit({ ...compra, supplier_nit: "576937-K" }, b, "purchase").ok).toBe(true);
  });
  it("compras usa supplier_nit (DUAGT sin cambio => ok)", () => {
    const compra = { invoice_date: "2019-02-01", invoice_number: "1", supplier_nit: "DUAGT", total_amount: 0 };
    expect(isMinimallyCompleteForEdit({ ...compra, invoice_number: "2" }, ledgerBaselineOf(compra, "purchase"), "purchase").ok).toBe(true);
  });
  it("filas nuevas siguen con isMinimallyComplete (VARIOS no basta)", () => {
    expect(isMinimallyComplete(venta, "sale").missing).toEqual(["NIT válido"]);
  });
});

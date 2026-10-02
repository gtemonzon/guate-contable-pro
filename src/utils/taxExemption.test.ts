/**
 * Exención temporal IVA/IDP (Decreto 22-2026): motor, resolución por fecha y
 * paso final del importador.
 * Run with: bunx vitest run src/utils/taxExemption.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { calculateMixedTax, applyMixedTaxToRow, rowNeedsRecalc } from "./purchaseTaxCalculation";
import { resolveExemption, findActiveExemptionWindow, exemptionBadgeLabel } from "./taxExemption";
import { finalizeImportedPurchase } from "./purchaseImportTax";
import { buildPurchaseLines } from "./purchaseJournalLinesBuilder";

const RULES = [{
  id: 1,
  code: "COMBUSTIBLE_DEC_22_2026",
  name: "Exención temporal IVA/IDP combustibles",
  legal_reference: "Decreto 22-2026 (Diario de Centro América, 30/09/2026), Arts. 2, 3 y 6",
  operation_type_code: "COMBUSTIBLE",
  applies_to: "PURCHASE",
  valid_from: "2026-10-01",
  valid_to: "2026-12-31",
  vat_rate: 0,
  blocks_idp: true,
  is_active: true,
}];

describe("resolveExemption (fechas como texto, sin zona horaria)", () => {
  it("bordes de vigencia", () => {
    expect(resolveExemption(RULES, "COMBUSTIBLE", "2026-09-30")).toBeNull();
    expect(resolveExemption(RULES, "COMBUSTIBLE", "2026-10-01")?.code).toBe("COMBUSTIBLE_DEC_22_2026");
    expect(resolveExemption(RULES, "COMBUSTIBLE", "2026-12-31")?.code).toBe("COMBUSTIBLE_DEC_22_2026");
    expect(resolveExemption(RULES, "COMBUSTIBLE", "2027-01-01")).toBeNull();
  });
  it("otro tipo de operación no aplica", () => {
    expect(resolveExemption(RULES, "BIENES", "2026-10-15")).toBeNull();
  });
  it("ventana activa independiente del tipo", () => {
    expect(findActiveExemptionWindow(RULES, "2026-11-01")?.code).toBe("COMBUSTIBLE_DEC_22_2026");
    expect(findActiveExemptionWindow(RULES, "2026-09-30")).toBeNull();
  });
  it("insignia", () => {
    expect(exemptionBadgeLabel(resolveExemption(RULES, "COMBUSTIBLE", "2026-10-01"))).toBe("Exonerado Decreto 22-2026");
  });
});

describe("calculateMixedTax con exención", () => {
  const ex = resolveExemption(RULES, "COMBUSTIBLE", "2026-10-01");
  it("sin exención el cálculo no cambia", () => {
    const r = calculateMixedTax({ totalAmount: 250, documentType: "FACT" });
    expect(r.vat).toBe(26.79);
    expect(r.base).toBe(223.21);
  });
  it("FACT 250 → IVA 0, base 250", () => {
    const r = calculateMixedTax({ totalAmount: 250, documentType: "FACT", exemption: ex });
    expect(r.vat).toBe(0);
    expect(r.base).toBe(250);
    expect(r.exemptionCode).toBe("COMBUSTIBLE_DEC_22_2026");
  });
  it("IDP 31.57 con blocksIdp → exempt 0 y categoría null", () => {
    const r = calculateMixedTax({ totalAmount: 250, exemptAmount: 31.57, taxCategory: "IDP", exemption: ex });
    expect(r.exempt).toBe(0);
    expect(r.taxCategory).toBeNull();
    expect(r.base).toBe(250);
  });
  it("No afecto que no es IDP se conserva", () => {
    const r = calculateMixedTax({ totalAmount: 250, exemptAmount: 10, taxCategory: "OTHER", exemption: ex });
    expect(r.exempt).toBe(10);
    expect(r.base).toBe(240);
    expect(r.vat).toBe(0);
  });
  it("FPEQ / NCRE sin exención: sin regresiones", () => {
    expect(calculateMixedTax({ totalAmount: 100, documentType: "FPEQ" })).toMatchObject({ vat: 0, base: 100 });
    expect(calculateMixedTax({ totalAmount: 112, documentType: "NCRE" })).toMatchObject({ vat: 12, base: 100 });
  });
});

describe("rowNeedsRecalc / applyMixedTaxToRow", () => {
  const exRow = { total_amount: 250, exempt_amount: 0, fel_document_type: "FACT", base_amount: 250, vat_amount: 0 };
  it("una fila exonerada nunca se devuelve al 12%", () => {
    expect(rowNeedsRecalc(exRow)).toBe(false);
    expect(rowNeedsRecalc({ ...exRow, exemption_rule_code: "COMBUSTIBLE_DEC_22_2026" })).toBe(false);
    expect(rowNeedsRecalc(exRow, { exemption: null })).toBe(false);
  });
  it("fila al 12% con exención vigente sí se recalcula a 0", () => {
    const row12 = { ...exRow, base_amount: 223.21, vat_amount: 26.79 };
    const ex = resolveExemption(RULES, "COMBUSTIBLE", "2026-10-01");
    expect(rowNeedsRecalc(row12, { exemption: ex })).toBe(true);
    const fixed = applyMixedTaxToRow(row12, { exemption: ex });
    expect(fixed).toMatchObject({ vat_amount: 0, base_amount: 250, exemption_rule_code: "COMBUSTIBLE_DEC_22_2026", vat_rate_applied: 0 });
  });
  it("fila normal mal calculada sigue detectándose", () => {
    expect(rowNeedsRecalc({ ...exRow, base_amount: 200, vat_amount: 50 })).toBe(true);
  });
  it("sin exención applyMixedTaxToRow limpia los sellos", () => {
    const r = applyMixedTaxToRow({ ...exRow, exemption_rule_code: "X", vat_rate_applied: 0 }, { exemption: null });
    expect(r).toMatchObject({ vat_amount: 26.79, base_amount: 223.21, exemption_rule_code: null, vat_rate_applied: null });
  });
});

describe("pólizas: fila sellada no genera IVA crédito", () => {
  it("buildPurchaseLines respeta el sello", () => {
    const lines = buildPurchaseLines(
      { total_amount: 250, fel_document_type: "FACT", expense_account_id: 10, exemption_rule_code: "COMBUSTIBLE_DEC_22_2026", vat_rate_applied: 0 },
      { vat_credit_account_id: 99 },
    );
    expect(lines).toEqual([{ account_id: 10, amount: 250, role: "EXPENSE" }]);
  });
});

describe("finalizeImportedPurchase", () => {
  const opCode = (id) => ({ 7: "COMBUSTIBLE", 1: "BIENES" }[id] ?? null);
  const base = {
    invoice_date: "2026-10-05", invoice_series: "A", invoice_number: "1", fel_document_type: "FACT",
    supplier_name: "Gasolinera", total_amount: 250, base_amount: 223.21, vat_amount: 26.79, net_amount: 223.21,
    exempt_amount: 0, tax_category: null,
  };
  it("b) COMBUSTIBLE en octubre → exonerada y sellada", () => {
    const f = finalizeImportedPurchase({ ...base, operation_type_id: 7, __satVat: 0, __satIdp: 0 }, { rules: RULES, operationTypeCode: opCode });
    expect(f.exempted).toBe(true);
    expect(f.record).toMatchObject({ vat_amount: 0, base_amount: 250, net_amount: 250, exemption_rule_code: "COMBUSTIBLE_DEC_22_2026" });
    expect(f.satDifference).toBeNull();
  });
  it("c) sin tipo Combustible, IVA 0 y petróleo 0 en el archivo → IVA 0 con advertencia", () => {
    const f = finalizeImportedPurchase({ ...base, operation_type_id: 1, __satVat: 0, __satIdp: 0 }, { rules: RULES, operationTypeCode: opCode });
    expect(f.exempted).toBe(false);
    expect(f.record).toMatchObject({ vat_amount: 0, base_amount: 250, exemption_rule_code: null });
    expect(f.warning).toContain("Decreto 22-2026");
  });
  it("d) fuera de ventana: IVA SAT distinto → solo advertencia, cálculo sin cambios", () => {
    const f = finalizeImportedPurchase({ ...base, invoice_date: "2026-09-10", operation_type_id: 1, __satVat: 0 }, { rules: RULES, operationTypeCode: opCode });
    expect(f.record.vat_amount).toBe(26.79);
    expect(f.warning).toBeNull();
    expect(f.satDifference).toMatchObject({ satVat: 0, calculatedVat: 26.79 });
  });
  it("factura de septiembre con IVA del archivo correcto: sin cambios ni avisos", () => {
    const f = finalizeImportedPurchase({ ...base, invoice_date: "2026-09-10", operation_type_id: 7, __satVat: 26.79 }, { rules: RULES, operationTypeCode: opCode });
    expect(f.record).toMatchObject({ vat_amount: 26.79, base_amount: 223.21, exemption_rule_code: null });
    expect(f.satDifference).toBeNull();
    expect(f.warning).toBeNull();
  });
  it("FPEQ en octubre sin tipo: no es caso c (no genera IVA)", () => {
    const f = finalizeImportedPurchase({ ...base, fel_document_type: "FPEQ", vat_amount: 0, base_amount: 250, operation_type_id: null, __satVat: 0 }, { rules: RULES, operationTypeCode: opCode });
    expect(f.warning).toBeNull();
  });
});

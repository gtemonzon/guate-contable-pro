import { describe, it, expect } from "vitest";
import { finalizeImportedPurchase, stripImportInternals, type ImportedPurchaseLike } from "./purchaseImportTax";
import { calculateMixedTax, getTaxCategoryLabel, persistedTaxCategory } from "./purchaseTaxCalculation";
import { buildPurchaseLines, resolveNonVatAccount } from "./purchaseJournalLinesBuilder";
import type { TaxExemptionRule } from "./taxExemption";

const context = { rules: [], operationTypeCode: () => null };
function purchase(total: number, satVat: number, overrides: Partial<ImportedPurchaseLike> = {}): ImportedPurchaseLike {
  const r = calculateMixedTax({ totalAmount: total, exemptAmount: overrides.exempt_amount, documentType: overrides.fel_document_type });
  return {
    invoice_date: "2025-10-15", invoice_series: "A", invoice_number: "1", fel_document_type: "FACT",
    supplier_name: "Proveedor", total_amount: total, base_amount: r.base, net_amount: r.base,
    vat_amount: r.vat, exempt_amount: r.exempt, tax_category: null, __satVat: satVat, __satVatSource: "xls",
    ...overrides,
  };
}
const fuelRule: TaxExemptionRule = {
  id: 1, code: "COMBUSTIBLE_DEC_22_2026", name: "Exención temporal IVA/IDP combustibles",
  legal_reference: "Decreto 22-2026", operation_type_code: "COMBUSTIBLE", applies_to: "PURCHASE",
  valid_from: "2026-10-01", valid_to: "2026-12-31", vat_rate: 0, blocks_idp: true, is_active: true,
};

describe("finalizeImportedPurchase: líneas exentas CSV/XLS SAT", () => {
  it.each([
    [259.35, 6.8625, 195.30, 6.86, 57.19],
    [310.15, 26.555357, 62.30, 26.56, 221.29],
    [404.40, 0, 404.40, 0, 0],
    [206.50, 20.9893, 10.60, 20.99, 174.91],
  ])("total %s e IVA SAT %s separan exento %s", (total, satVat, exempt, vat, base) => {
    const result = finalizeImportedPurchase(purchase(total, satVat), context);
    expect(result.record).toMatchObject({ exempt_amount: exempt, vat_amount: vat, base_amount: base, net_amount: base, tax_category: "EXEMPT" });
    expect(result.derivedExempt).toBe(exempt);
    expect(result.satDifference).toBeNull();
  });
  it("FCAM sin IVA separa todo el total como exento", () => {
    const result = finalizeImportedPurchase(purchase(346.75, 0, { fel_document_type: "FCAM" }), context);
    expect(result.record).toMatchObject({ exempt_amount: 346.75, vat_amount: 0, base_amount: 0 });
    expect(result.derivedExempt).toBe(346.75);
    expect(result.satDifference).toBeNull();
  });
  it("no deriva dentro de la tolerancia Q0.05", () => {
    const result = finalizeImportedPurchase(purchase(758.10, 81.19), context);
    expect(result.record).toMatchObject({ exempt_amount: 0, vat_amount: 81.22, tax_category: null });
    expect(result.derivedExempt).toBeNull();
  });
  it("electricidad ya descontada no deriva y conserva su categoría", () => {
    const result = finalizeImportedPurchase(purchase(65.2884, 6.2184, { exempt_amount: 7.25, tax_category: "ELECTRICITY_TAX" }), context);
    expect(result.record).toMatchObject({ exempt_amount: 7.25, vat_amount: 6.22, tax_category: "ELECTRICITY_TAX" });
    expect(result.derivedExempt).toBeNull();
  });
  it("sin origen XLS, un PDF mantiene sus cálculos y diferencia", () => {
    const input = purchase(259.35, 6.8625, { __satVatSource: undefined });
    const result = finalizeImportedPurchase(input, context);
    expect(result.record.vat_amount).toBe(input.vat_amount);
    expect(result.record.exempt_amount).toBe(0);
    expect(result.derivedExempt).toBeNull();
    expect(result.satDifference?.calculatedVat).toBe(27.79);
  });
  it("FPEQ no deriva aunque el IVA previo esté errado", () => {
    const result = finalizeImportedPurchase(purchase(259.35, 0, { fel_document_type: "FPEQ", vat_amount: 27.79 }), context);
    expect(result.derivedExempt).toBeNull();
    expect(result.record.exempt_amount).toBe(0);
  });
  it("la ventana de combustible sin tipo conserva el caso c", () => {
    const result = finalizeImportedPurchase(purchase(404.40, 0, { invoice_date: "2026-10-15", __satIdp: 0 }), { ...context, rules: [fuelRule] });
    expect(result.record).toMatchObject({ base_amount: 404.40, net_amount: 404.40, vat_amount: 0, exempt_amount: 0 });
    expect(result.warning).toContain("Decreto 22-2026");
    expect(result.derivedExempt).toBeNull();
    expect(result.satDifference).toBeNull();
  });
  it("la exención resuelta mantiene prioridad sobre la derivación", () => {
    const result = finalizeImportedPurchase(purchase(404.40, 0, { invoice_date: "2026-10-15" }), { rules: [fuelRule], operationTypeCode: () => "COMBUSTIBLE" });
    expect(result.exempted).toBe(true);
    expect(result.record.base_amount).toBe(404.40);
    expect(result.derivedExempt).toBeNull();
  });
  it("no deriva sin IVA SAT definido", () => {
    const result = finalizeImportedPurchase(purchase(259.35, 0, { __satVat: undefined }), context);
    expect(result.derivedExempt).toBeNull();
    expect(result.record.vat_amount).toBe(27.79);
  });
  it("conserva la categoría existente al sumar exento derivado", () => {
    const result = finalizeImportedPurchase(purchase(269.35, 6.8625, { exempt_amount: 10, tax_category: "ELECTRICITY_TAX" }), context);
    expect(result.derivedExempt).toBe(195.30);
    expect(result.record).toMatchObject({ exempt_amount: 205.30, vat_amount: 6.86, tax_category: "ELECTRICITY_TAX" });
  });
  it("no deriva si el monto deducido es <= Q0.05", () => {
    const result = finalizeImportedPurchase(purchase(112, 12, { vat_amount: 12.06 }), context);
    expect(result.derivedExempt).toBeNull();
    expect(result.record.exempt_amount).toBe(0);
  });
  it("elimina todos los campos internos antes de insertar", () => {
    const result = stripImportInternals({ ...purchase(259.35, 6.8625), __sourceRow: 1, __satIdp: 0 });
    expect(Object.keys(result).filter(k => k.startsWith("__"))).toEqual([]);
    expect(result.total_amount).toBe(259.35);
  });
});

describe("EXEMPT como porción no afecta equivalente a OTHER", () => {
  it("guarda OTHER sin modificar montos por la restricción vigente", () => {
    const finalized = finalizeImportedPurchase(purchase(259.35, 6.8625), context);
    const stored = stripImportInternals(finalized.record);
    expect(finalized.record.tax_category).toBe("EXEMPT");
    expect(stored).toMatchObject({ tax_category: "OTHER", exempt_amount: 195.30, vat_amount: 6.86, base_amount: 57.19 });
    expect(persistedTaxCategory("IDP")).toBe("IDP");
    expect(persistedTaxCategory("ELECTRICITY_TAX")).toBe("ELECTRICITY_TAX");
  });
  it("muestra la etiqueta elegida", () => {
    expect(getTaxCategoryLabel("EXEMPT")).toBe("Compras exentas de IVA");
  });
  it("usa la misma cuenta configurada que OTHER", () => {
    const mapping = { account_non_vat_other_id: 42 };
    expect(resolveNonVatAccount("EXEMPT", mapping)).toBe(42);
    expect(resolveNonVatAccount("EXEMPT", {})).toBeNull();
  });
  it("genera líneas iguales a OTHER sin inventar una cuenta nueva", () => {
    const input = { total_amount: 259.35, exempt_amount: 195.30, expense_account_id: 10, fel_document_type: "FACT" };
    const mapping = { account_non_vat_other_id: 42, vat_credit_account_id: 12 };
    const lines = buildPurchaseLines({ ...input, tax_category: "EXEMPT" }, mapping);
    expect(lines).toEqual(buildPurchaseLines({ ...input, tax_category: "OTHER" }, mapping));
    expect(lines).toContainEqual({ account_id: 42, amount: 195.30, role: "NON_VAT" });
  });
});
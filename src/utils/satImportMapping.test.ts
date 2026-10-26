import { describe, it, expect } from "vitest";
import {
  SAT_OTHER_TAX_COLUMNS,
  computeNonVatTaxes,
  findSATColumnIndex,
  normalizeHeader,
  calculateVATFromTotal,
} from "./satImportMapping";
import { calculateMixedTax } from "./purchaseTaxCalculation";

describe("computeNonVatTaxes + calculateMixedTax (importador SAT de compras)", () => {
  it("Empresa Eléctrica 21/oct: descuenta la tasa municipal", () => {
    const r = computeNonVatTaxes({ tasa_municipal: 7.25 });
    expect(r.total).toBe(7.25);
    expect(r.category).toBe("ELECTRICITY_TAX");
    const m = calculateMixedTax({ totalAmount: 65.2884, exemptAmount: r.total, documentType: "FACT" });
    expect(m.base).toBe(51.82);
    expect(m.vat).toBe(6.22);
  });

  it("Empresa Eléctrica 03/oct: descuenta la tasa municipal", () => {
    const r = computeNonVatTaxes({ tasa_municipal: 34.54 });
    expect(r.total).toBe(34.54);
    const m = calculateMixedTax({ totalAmount: 332.1128, exemptAmount: r.total, documentType: "FACT" });
    expect(m.base).toBe(265.69);
    expect(m.vat).toBe(31.88);
  });

  it("sin otros impuestos el resultado es igual que hoy", () => {
    const r = computeNonVatTaxes({ petroleo: 0, tasa_municipal: 0 });
    expect(r.total).toBe(0);
    expect(r.category).toBeNull();
    const m = calculateMixedTax({ totalAmount: 65, exemptAmount: r.total, documentType: "FACT" });
    expect(m.base).toBe(58.04);
    expect(m.vat).toBe(6.96);
  });

  it("combustible con petróleo: categoría IDP e igual a calculateVATFromTotal", () => {
    const r = computeNonVatTaxes({ petroleo: 31.57 });
    expect(r.category).toBe("IDP");
    const m = calculateMixedTax({ totalAmount: 250, exemptAmount: r.total, documentType: "FACT" });
    const legacy = calculateVATFromTotal(250, "FACT", 0.12, 31.57);
    expect(m.base).toBe(legacy.baseAmount);
    expect(m.vat).toBe(legacy.vatAmount);
  });

  it("FPEQ con tasa municipal: IVA 0 y base = total − no afecto", () => {
    const r = computeNonVatTaxes({ tasa_municipal: 5 });
    const m = calculateMixedTax({ totalAmount: 100, exemptAmount: r.total, documentType: "FPEQ" });
    expect(m.vat).toBe(0);
    expect(m.base).toBe(95);
  });

  it("varias categorías: gana la de mayor monto", () => {
    expect(computeNonVatTaxes({ petroleo: 10, tasa_municipal: 5 })).toEqual({ total: 15, category: "IDP" });
    expect(computeNonVatTaxes({ petroleo: 2, tasa_municipal: 5 })).toEqual({ total: 7, category: "ELECTRICITY_TAX" });
  });
});

describe("SAT_OTHER_TAX_COLUMNS con encabezados reales", () => {
  const headers = [
    "Gran Total (Moneda Original)",
    "IVA (monto de este impuesto)",
    "Petróleo (monto de este impuesto)",
    "Bebidas alcohólicas (monto de este impuesto)",
    "Bebidas no Alcohólicas (monto de este impuesto)",
    "Tasa Municipal (monto de este impuesto)",
  ].map(normalizeHeader);

  it("encuentra la tasa municipal", () => {
    expect(findSATColumnIndex(headers, SAT_OTHER_TAX_COLUMNS.tasa_municipal.names)).toBe(5);
  });

  it("no confunde bebidas alcohólicas con no alcohólicas", () => {
    expect(findSATColumnIndex(headers, SAT_OTHER_TAX_COLUMNS.bebidas_alcoholicas.names)).toBe(3);
    expect(findSATColumnIndex(headers, SAT_OTHER_TAX_COLUMNS.bebidas_no_alcoholicas.names)).toBe(4);
  });

  it("columna ausente devuelve -1", () => {
    expect(findSATColumnIndex(headers, SAT_OTHER_TAX_COLUMNS.cemento.names)).toBe(-1);
  });
});

/**
 * Run with: bunx vitest run src/utils/dashboardPresentedForms.test.ts
 */
import { describe, it, expect } from "vitest";
import { findPresentedMonthlyForm, computeTotalTaxEstimate } from "./dashboardPresentedForms";

const form = (tax_type, extra = {}) => ({
  id: 1, tax_type, period_type: "mensual", period_month: 9, period_year: 2026,
  form_number: "53167224516", amount_paid: "178", payment_date: "2026-10-07", is_active: true, ...extra,
});

describe("findPresentedMonthlyForm — IVA", () => {
  it("IVA PEQUEÑO CONTRIBUYENTE de septiembre (empresa 25)", () => {
    expect(findPresentedMonthlyForm([form("IVA PEQUEÑO CONTRIBUYENTE")], "IVA", 2026, 9)).toEqual({
      formNumber: "53167224516", amountPaid: 178, paymentDate: "2026-10-07",
    });
  });
  it("IVA GENERAL coincide; RETENCION IVA no", () => {
    expect(findPresentedMonthlyForm([form("IVA GENERAL", { form_number: "53167920286" })], "IVA", 2026, 9)?.formNumber).toBe("53167920286");
    expect(findPresentedMonthlyForm([form("RETENCION IVA")], "IVA", 2026, 9)).toBeNull();
    expect(findPresentedMonthlyForm([form("Retenciones de IVA")], "IVA", 2026, 9)).toBeNull();
  });
});

describe("findPresentedMonthlyForm — ISR mensual", () => {
  it("ISR OPCIONAL MENSUAL, ISR a secas e ISR MENSUAL coinciden", () => {
    for (const t of ["ISR OPCIONAL MENSUAL", "ISR", "ISR MENSUAL"]) {
      expect(findPresentedMonthlyForm([form(t)], "ISR_MENSUAL", 2026, 9)).not.toBeNull();
    }
  });
  it("ISR RETENCIONES, ISR TRIMESTRAL e ISR ANUAL no", () => {
    for (const t of ["ISR RETENCIONES", "ISR TRIMESTRAL", "ISR ANUAL"]) {
      expect(findPresentedMonthlyForm([form(t)], "ISR_MENSUAL", 2026, 9)).toBeNull();
    }
  });
  it("IVA no cuenta como ISR ni al revés", () => {
    expect(findPresentedMonthlyForm([form("IVA GENERAL")], "ISR_MENSUAL", 2026, 9)).toBeNull();
    expect(findPresentedMonthlyForm([form("ISR")], "IVA", 2026, 9)).toBeNull();
  });
});

describe("findPresentedMonthlyForm — período y estado", () => {
  it("otro mes, otro año o inactivo no", () => {
    expect(findPresentedMonthlyForm([form("IVA GENERAL", { period_month: 8 })], "IVA", 2026, 9)).toBeNull();
    expect(findPresentedMonthlyForm([form("IVA GENERAL", { period_year: 2025 })], "IVA", 2026, 9)).toBeNull();
    expect(findPresentedMonthlyForm([form("IVA GENERAL", { is_active: false })], "IVA", 2026, 9)).toBeNull();
  });
  it("period_type trimestral o anual no cuenta; nulo sí", () => {
    expect(findPresentedMonthlyForm([form("ISR", { period_type: "trimestral" })], "ISR_MENSUAL", 2026, 9)).toBeNull();
    expect(findPresentedMonthlyForm([form("ISR", { period_type: "anual" })], "ISR_MENSUAL", 2026, 9)).toBeNull();
    expect(findPresentedMonthlyForm([form("ISR", { period_type: null })], "ISR_MENSUAL", 2026, 9)).not.toBeNull();
  });
  it("con dos coincidencias gana el más reciente (fecha y luego id)", () => {
    const forms = [
      form("IVA GENERAL", { id: 1, form_number: "A", payment_date: "2026-10-05" }),
      form("IVA GENERAL", { id: 2, form_number: "B", payment_date: "2026-10-07" }),
      form("IVA GENERAL", { id: 3, form_number: "C", payment_date: "2026-10-06" }),
    ];
    expect(findPresentedMonthlyForm(forms, "IVA", 2026, 9)?.formNumber).toBe("B");
    const sameDay = [
      form("IVA GENERAL", { id: 4, form_number: "D" }),
      form("IVA GENERAL", { id: 9, form_number: "E" }),
    ];
    expect(findPresentedMonthlyForm(sameDay, "IVA", 2026, 9)?.formNumber).toBe("E");
  });
});

describe("computeTotalTaxEstimate", () => {
  const presented = { formNumber: "1", amountPaid: 178, paymentDate: "2026-10-07" };
  it("excluye los presentados y lo negativo", () => {
    expect(computeTotalTaxEstimate([
      { amount: 178, presented },
      { amount: 500 },
      { amount: -159 },
      { amount: 250, presented: null },
    ])).toBe(750);
  });
  it("todos presentados => 0", () => {
    expect(computeTotalTaxEstimate([{ amount: 178, presented }, { amount: 0, presented }])).toBe(0);
  });
});

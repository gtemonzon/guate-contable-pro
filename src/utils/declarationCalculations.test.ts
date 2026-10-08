/**
 * Run with: bunx vitest run src/utils/declarationCalculations.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  quarterStartMonth, formTypeToTaxType, formTypeToPeriodType, periodMonthForForm, mapTaxTypeToFormType,
} from "./declarationCalculations";
import type { TaxFormType } from "@/hooks/useDeclaracionCalculo";

const TYPES: TaxFormType[] = ["IVA_GENERAL", "IVA_PEQUENO", "ISR_MENSUAL", "ISR_TRIMESTRAL", "ISO_TRIMESTRAL"];

describe("quarterStartMonth", () => {
  it("1-3 → 1, 4-6 → 4, 7-9 → 7, 10-12 → 10", () => {
    const expected = [1, 1, 1, 4, 4, 4, 7, 7, 7, 10, 10, 10];
    for (let m = 1; m <= 12; m++) expect(quarterStartMonth(m)).toBe(expected[m - 1]);
  });
});

describe("formTypeToTaxType", () => {
  it("textos", () => {
    expect(formTypeToTaxType("IVA_GENERAL")).toBe("IVA GENERAL");
    expect(formTypeToTaxType("IVA_PEQUENO")).toBe("IVA PEQUEÑO CONTRIBUYENTE");
    expect(formTypeToTaxType("ISR_MENSUAL")).toBe("ISR MENSUAL");
    expect(formTypeToTaxType("ISR_TRIMESTRAL")).toBe("ISR TRIMESTRAL");
    expect(formTypeToTaxType("ISO_TRIMESTRAL")).toBe("ISO TRIMESTRAL");
  });
  it("ida y vuelta con mapTaxTypeToFormType", () => {
    for (const t of TYPES) expect(mapTaxTypeToFormType(formTypeToTaxType(t))).toBe(t);
  });
});

describe("formTypeToPeriodType / periodMonthForForm", () => {
  it("mensuales", () => {
    for (const t of ["IVA_GENERAL", "IVA_PEQUENO", "ISR_MENSUAL"] as TaxFormType[]) {
      expect(formTypeToPeriodType(t)).toBe("mensual");
      expect(periodMonthForForm(t, 9)).toBe(9);
    }
  });
  it("trimestrales usan el mes de inicio", () => {
    for (const t of ["ISR_TRIMESTRAL", "ISO_TRIMESTRAL"] as TaxFormType[]) {
      expect(formTypeToPeriodType(t)).toBe("trimestral");
      expect(periodMonthForForm(t, 9)).toBe(7);
      expect(periodMonthForForm(t, 12)).toBe(10);
      expect(periodMonthForForm(t, 1)).toBe(1);
    }
  });
});

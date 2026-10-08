/**
 * Run with: bunx vitest run src/constants/taxFormTypes.test.ts
 */
import { describe, it, expect } from "vitest";
import { TAX_FORM_TYPE_OPTIONS } from "./taxFormTypes";

describe("TAX_FORM_TYPE_OPTIONS", () => {
  it("5 tipos únicos, en orden", () => {
    const types = TAX_FORM_TYPE_OPTIONS.map((o) => o.type);
    expect(types).toEqual(["IVA_GENERAL", "IVA_PEQUENO", "ISR_MENSUAL", "ISR_TRIMESTRAL", "ISO_TRIMESTRAL"]);
    expect(new Set(types).size).toBe(5);
  });
  it("tasas por defecto y etiquetas", () => {
    expect(Object.fromEntries(TAX_FORM_TYPE_OPTIONS.map((o) => [o.type, o.defaultRate]))).toEqual({
      IVA_GENERAL: 12, IVA_PEQUENO: 5, ISR_MENSUAL: 5, ISR_TRIMESTRAL: 25, ISO_TRIMESTRAL: 1,
    });
    expect(TAX_FORM_TYPE_OPTIONS[2].label).toBe("ISR Opción Mensual (SAT-1311)");
  });
});

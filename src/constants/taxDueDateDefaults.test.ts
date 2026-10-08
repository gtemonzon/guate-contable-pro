/**
 * Valores por defecto de vencimientos: los impuestos trimestrales usan referencia trimestral.
 * Run with: bunx vitest run src/constants/taxDueDateDefaults.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { DEFAULT_TAXES } from "./taxDueDateDefaults";
import { getDefaultTaxConfigs } from "@/utils/dueDateCalculations";

const QUARTERLY = ["isr_trimestral", "iso", "iso_trimestral"];
const LISTS = {
  DEFAULT_TAXES,
  getDefaultTaxConfigs: getDefaultTaxConfigs(),
};
const ref = (taxType: string) => DEFAULT_TAXES.find((t) => t.tax_type === taxType)?.reference_period;

describe("valores por defecto de vencimientos", () => {
  it.each(Object.entries(LISTS))("(a) %s: los trimestrales usan quarter_end_next_month", (_, list) => {
    const quarterly = list.filter((t) => QUARTERLY.includes(t.tax_type));
    expect(quarterly.length).toBeGreaterThan(0);
    for (const t of quarterly) expect(t.reference_period).toBe("quarter_end_next_month");
  });

  it.each(Object.entries(LISTS))("(b) %s: ningún 'trimestral' usa referencia mensual", (_, list) => {
    for (const t of list.filter((x) => x.tax_type.includes("trimestral"))) {
      expect(["current_month", "next_month"]).not.toContain(t.reference_period);
    }
  });

  it("(c) los no trimestrales de DEFAULT_TAXES no cambiaron", () => {
    expect(ref("iva_mensual")).toBe("current_month");
    expect(ref("retencion_iva")).toBe("next_month");
    expect(ref("retencion_isr")).toBe("next_month");
    expect(DEFAULT_TAXES.map((t) => t.tax_type)).toEqual([
      "iva_mensual", "isr_trimestral", "iso_trimestral", "retencion_isr", "retencion_iva", "isr_anual",
    ]);
  });
});

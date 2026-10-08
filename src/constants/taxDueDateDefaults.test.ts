/**
 * Valores por defecto de vencimientos: los impuestos trimestrales usan referencia trimestral.
 * Run with: bunx vitest run src/constants/taxDueDateDefaults.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { DEFAULT_TAXES } from "./taxDueDateDefaults";
import { getDefaultTaxConfigs, getDefaultDueDateConfigs } from "@/utils/dueDateCalculations";

const QUARTERLY = ["isr_trimestral", "iso", "iso_trimestral"];
const LISTS = {
  DEFAULT_TAXES,
  getDefaultTaxConfigs: getDefaultTaxConfigs(),
  getDefaultDueDateConfigs: getDefaultDueDateConfigs(),
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

  it("(d) lista única: getDefaultTaxConfigs y getDefaultDueDateConfigs salen de DEFAULT_TAXES", () => {
    const keys = DEFAULT_TAXES.map((t) => t.tax_type);
    expect(getDefaultTaxConfigs().map((t) => t.tax_type)).toEqual(keys);
    expect(getDefaultDueDateConfigs().map((t) => t.tax_type)).toEqual(keys);
    for (const c of getDefaultTaxConfigs()) expect("is_active" in c).toBe(false);
    // days_value null => 0; las retenciones conservan sus días (IVA 15, ISR 10).
    const byType = Object.fromEntries(getDefaultTaxConfigs().map((c) => [c.tax_type, c]));
    expect(byType.iva_mensual.days_value).toBe(0);
    expect(byType.retencion_iva.days_value).toBe(15);
    expect(byType.retencion_isr.days_value).toBe(10);
    expect(byType.isr_anual).toMatchObject({ calculation_type: "fixed_day", days_value: 31 });
  });

  it("(e) getDefaultDueDateConfigs conserva los estados: solo IVA mensual e ISR trimestral activos", () => {
    expect(getDefaultDueDateConfigs().filter((c) => c.is_active).map((c) => c.tax_type))
      .toEqual(["iva_mensual", "isr_trimestral"]);
  });
});

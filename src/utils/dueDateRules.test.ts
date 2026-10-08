/**
 * Reglas de vencimiento: texto, validación y plan de guardado.
 * Run with: bunx vitest run src/utils/dueDateRules.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { describeDueDateRule, validateDueDateRows, planDueDateSave, isPermissionError } from "./dueDateRules";

const rule = (calculation_type, days_value, reference_period) =>
  describeDueDateRule({ calculation_type, days_value, reference_period });

describe("describeDueDateRule", () => {
  it("casos exactos", () => {
    expect(rule("last_business_day", null, "current_month")).toBe("Último día hábil del mes");
    expect(rule("last_business_day", 0, "quarter_end_next_month")).toBe("Último día hábil del mes siguiente al trimestre");
    expect(rule("last_business_day", null, "next_month")).toBe("Último día hábil del mes siguiente al período");
    expect(rule("business_days_after", 10, "next_month")).toBe("10 días hábiles del mes siguiente al período");
    expect(rule("business_days_after", 1, "next_month")).toBe("1 día hábil del mes siguiente al período");
    expect(rule("fixed_day", 31, "next_month")).toBe("Día 31 del mes siguiente al período");
  });
  it("valores desconocidos: texto crudo sin romper", () => {
    expect(rule("dia_raro", 5, "otro_periodo")).toBe("dia_raro otro_periodo");
    expect(rule("last_business_day", null, "")).toBe("Último día hábil");
    expect(rule(undefined, undefined, undefined)).toBe("");
  });
});

const row = (over = {}) => ({
  tax_type: "iva_mensual", tax_label: "IVA Mensual", calculation_type: "last_business_day", days_value: null,
  reference_period: "current_month", consider_holidays: true, is_active: true, ...over,
});

describe("validateDueDateRows", () => {
  it("filas válidas: sin errores", () => {
    expect(validateDueDateRows([
      row(),
      row({ tax_type: "retencion_iva", tax_label: "Retención IVA", calculation_type: "business_days_after", days_value: 15, reference_period: "next_month" }),
      row({ tax_type: "isr_anual", tax_label: "ISR Anual", calculation_type: "fixed_day", days_value: 31 }),
    ])).toEqual([]);
  });
  it("etiqueta vacía", () => {
    expect(validateDueDateRows([row({ tax_label: "  " })])).toEqual([
      { index: 0, tax_type: "iva_mensual", messages: ["La etiqueta no puede estar vacía"] },
    ]);
  });
  it("tax_type repetido: error en ambas filas", () => {
    const errs = validateDueDateRows([row(), row({ tax_label: "Otro" }), row({ tax_type: "iso" })]);
    expect(errs.map((e) => e.index)).toEqual([0, 1]);
    expect(errs[0].messages).toEqual(["Impuesto repetido"]);
  });
  it("día fijo fuera de 1–31", () => {
    for (const d of [0, 32, null, 1.5]) {
      expect(validateDueDateRows([row({ calculation_type: "fixed_day", days_value: d })])[0].messages)
        .toEqual(["El día fijo debe estar entre 1 y 31"]);
    }
    expect(validateDueDateRows([row({ calculation_type: "fixed_day", days_value: 1 })])).toEqual([]);
  });
  it("días hábiles < 1 o > 31", () => {
    expect(validateDueDateRows([row({ calculation_type: "business_days_after", days_value: 0 })])[0].messages)
      .toEqual(["Los días hábiles deben estar entre 1 y 31"]);
    expect(validateDueDateRows([row({ calculation_type: "business_days_after", days_value: 32 })])[0].messages)
      .toEqual(["Los días hábiles deben estar entre 1 y 31"]);
  });
  it("último día hábil ignora days_value", () => {
    expect(validateDueDateRows([row({ days_value: 0 })])).toEqual([]);
  });
  it("vigencia invertida (solo filas activas)", () => {
    const bad = { effective_from: "2026-05-01", effective_to: "2026-04-30" };
    expect(validateDueDateRows([row(bad)])[0].messages).toEqual(['"Hasta" no puede ser anterior a "Vigente desde"']);
    expect(validateDueDateRows([row({ ...bad, is_active: false })])).toEqual([]);
    expect(validateDueDateRows([row({ effective_from: "2026-05-01", effective_to: "2026-05-01" })])).toEqual([]);
  });
});

describe("planDueDateSave", () => {
  it("display_order = índice + 1 y tipos quitados", () => {
    const rows = [{ tax_type: "iva" }, { tax_type: "custom_1" }];
    expect(planDueDateSave(["iva", "iso", "custom_9", "iso"], rows)).toEqual({
      upserts: [{ tax_type: "iva", display_order: 1 }, { tax_type: "custom_1", display_order: 2 }],
      removedTypes: ["iso", "custom_9"],
    });
  });
  it("empresa sin filas: nada que quitar", () => {
    expect(planDueDateSave([], [{ tax_type: "iva_mensual" }]).removedTypes).toEqual([]);
  });
});

describe("isPermissionError", () => {
  it("42501 o mensaje de RLS", () => {
    expect(isPermissionError({ code: "42501", message: "x" })).toBe(true);
    expect(isPermissionError({ code: "PGRST", message: 'new row violates row-level security policy for table "tab_tax_due_date_config"' })).toBe(true);
    expect(isPermissionError({ message: "permission denied for table tab_tax_due_date_config" })).toBe(true);
  });
  it("otros errores o sin error", () => {
    expect(isPermissionError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isPermissionError(null)).toBe(false);
  });
});

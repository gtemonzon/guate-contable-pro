/**
 * Próximos vencimientos (Dashboard): ventana de 30 días y períodos trimestrales.
 * Run with: bunx vitest run src/utils/dueDateCalculations.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  computePendingDeadlines, taxFormMatchesConfig, isFormPresented, coveredPeriodForDueDate,
  parseHolidaysForYears, joinLabelsEs, calculateDueDate, toDateOnlyString,
  computeDueDateAlerts, isTaxAlertStale, getDefaultTaxConfigs,
} from "./dueDateCalculations";

// Configuración real de la empresa 26.
const ISO = { tax_type: "iso", tax_label: "ISO Trimestral", calculation_type: "last_business_day", days_value: 0, reference_period: "quarter_end_next_month", consider_holidays: true, is_active: true };
const ISR = { tax_type: "isr_trimestral", tax_label: "ISR Trimestral", calculation_type: "last_business_day", days_value: 0, reference_period: "quarter_end_next_month", consider_holidays: true, is_active: true };
const IVA = { tax_type: "iva", tax_label: "IVA Mensual", calculation_type: "last_business_day", days_value: 0, reference_period: "current_month", consider_holidays: true, is_active: true };
const CONFIGS = [ISO, ISR, IVA];

const ISR_Q3 = { tax_type: "ISR TRIMESTRAL", period_type: "trimestral", period_month: 7, period_year: 2026 };
const ISO_Q3 = { tax_type: "IMPUESTO DE SOLIDARIDAD", period_type: "trimestral", period_month: 7, period_year: 2026 };
const ivaForm = (m, y = 2026) => ({ tax_type: "IVA GENERAL", period_type: "mensual", period_month: m, period_year: y });
// IVA de julio y agosto también presentados (si no, aparecerían como vencidos).
const IVA_PREVIOS = [ivaForm(7), ivaForm(8)];
const FORMS = [ISR_Q3, ISO_Q3, ivaForm(9), ...IVA_PREVIOS];

const day = (y, m, d) => new Date(y, m - 1, d, 9, 30);
const ymd = (d) => toDateOnlyString(d.dueDate);
const run = (today, forms, configs = CONFIGS, holidays = []) =>
  computePendingDeadlines({ configs, holidays, forms, today });

describe("computePendingDeadlines (empresa 26)", () => {
  it("1. 07/10/2026 con Q3 presentado: nada en la ventana; ISO e ISR siguen el 29/01/2027 (114 d)", () => {
    const { inWindow, next } = run(day(2026, 10, 7), FORMS);
    expect(inWindow).toEqual([]);
    // Con el IVA de octubre pendiente, lo más cercano es el IVA (30/11/2026, 54 d).
    expect(next.map((d) => [d.label, ymd(d), d.daysUntil])).toEqual([
      ["IVA Mensual", "2026-11-30", 54],
      ["ISO Trimestral", "2027-01-29", 114],
      ["ISR Trimestral", "2027-01-29", 114],
    ]);
    // Solo los trimestrales (o con el IVA de octubre ya presentado): ISO e ISR el 29/01/2027.
    const trimestrales = run(day(2026, 10, 7), FORMS, [ISO, ISR]).next;
    const first = trimestrales.filter((d) => ymd(d) === ymd(trimestrales[0]));
    expect(first.map((d) => [d.label, ymd(d), d.daysUntil])).toEqual([
      ["ISO Trimestral", "2027-01-29", 114],
      ["ISR Trimestral", "2027-01-29", 114],
    ]);
    expect(joinLabelsEs(first.map((d) => d.label))).toBe("ISO Trimestral e ISR Trimestral");
  });

  it("2. sin los trimestrales: ISO e ISR el 30/10/2026 (23 d), Julio - Septiembre 2026", () => {
    const { inWindow } = run(day(2026, 10, 7), [ivaForm(9), ...IVA_PREVIOS]);
    expect(inWindow.map((d) => d.label)).toEqual(["ISO Trimestral", "ISR Trimestral"]);
    for (const d of inWindow) {
      expect(ymd(d)).toBe("2026-10-30");
      expect(d.daysUntil).toBe(23);
      expect(d.periodLabel).toBe("Julio - Septiembre 2026");
    }
  });

  it("3. IVA: sin el de septiembre vence 30/10/2026 (23 d); presentado, el siguiente es 30/11/2026", () => {
    const sinSep = run(day(2026, 10, 7), [ISR_Q3, ISO_Q3, ...IVA_PREVIOS]);
    expect(sinSep.inWindow).toHaveLength(1);
    expect(sinSep.inWindow[0]).toMatchObject({ label: "IVA Mensual", daysUntil: 23, periodLabel: "Septiembre 2026" });
    expect(ymd(sinSep.inWindow[0])).toBe("2026-10-30");

    const conSep = run(day(2026, 10, 7), FORMS, [IVA]);
    expect(conSep.inWindow).toEqual([]);
    expect(ymd(conSep.next[0])).toBe("2026-11-30");
  });

  it("4. 31/10/2026 con Q3 sin presentar: vencido hace 1 día", () => {
    const { inWindow } = run(day(2026, 10, 31), [ivaForm(9), ...IVA_PREVIOS], [ISO]);
    expect(inWindow[0]).toMatchObject({ daysUntil: -1, isOverdue: true, isUrgent: false });
    expect(ymd(inWindow[0])).toBe("2026-10-30");
  });

  it("5. el trimestre abr-jun (vencía 31/07/2026) no aparece: más de 60 días", () => {
    const { inWindow, next } = run(day(2026, 10, 7), [ISR_Q3, ISO_Q3], [ISO, ISR]);
    expect([...inWindow, ...next].some((d) => ymd(d) === "2026-07-31")).toBe(false);
  });

  it("6. 10/01/2027 con Q4 sin presentar: 29/01/2027 (19 d); igual en abril y julio", () => {
    const ene = run(day(2027, 1, 10), [ISR_Q3, ISO_Q3], [ISO, ISR]);
    expect(ene.inWindow.map((d) => [ymd(d), d.daysUntil, d.periodLabel])).toEqual([
      ["2027-01-29", 19, "Octubre - Diciembre 2026"],
      ["2027-01-29", 19, "Octubre - Diciembre 2026"],
    ]);
    const abr = run(day(2027, 4, 10), [], [ISO]);
    expect([ymd(abr.inWindow[0]), abr.inWindow[0].daysUntil, abr.inWindow[0].periodLabel]).toEqual(["2027-04-30", 20, "Enero - Marzo 2027"]);
    const jul = run(day(2027, 7, 10), [], [ISO]);
    expect([ymd(jul.inWindow[0]), jul.inWindow[0].daysUntil, jul.inWindow[0].periodLabel]).toEqual(["2027-07-30", 20, "Abril - Junio 2027"]);
  });

  it("9. orden: vencidos primero (el más vencido antes), luego por fecha; empate por etiqueta", () => {
    // 05/11/2026: IVA de octubre (30/11, 25 d); Q3 sin presentar (30/10, -6 d); IVA de sep sin presentar (30/10, -6 d).
    const { inWindow } = run(day(2026, 11, 5), [...IVA_PREVIOS]);
    expect(inWindow.map((d) => [d.label, d.daysUntil])).toEqual([
      ["ISO Trimestral", -6],
      ["ISR Trimestral", -6],
      ["IVA Mensual", -6],
    ]);
    const mixed = run(day(2026, 11, 5), [...IVA_PREVIOS, ivaForm(9)]);
    expect(mixed.inWindow.map((d) => [d.label, d.isOverdue])).toEqual([
      ["ISO Trimestral", true],
      ["ISR Trimestral", true],
      ["IVA Mensual", false],
    ]);
  });

  it("sin configs activas: vacío", () => {
    expect(run(day(2026, 10, 7), FORMS, [{ ...IVA, is_active: false }])).toEqual({ inWindow: [], next: [] });
  });
});

describe("7. coincidencias de formularios", () => {
  it("ISO: IMPUESTO DE SOLIDARIDAD, ISO, ISO TRIMESTRAL", () => {
    for (const t of ["IMPUESTO DE SOLIDARIDAD", "ISO", "ISO TRIMESTRAL", "Impuesto de Solidaridad"]) {
      expect(taxFormMatchesConfig(t, "iso")).toBe(true);
      expect(taxFormMatchesConfig(t, "iso_trimestral")).toBe(true);
    }
  });
  it("ISR ANUAL no coincide con isr_trimestral", () => {
    expect(taxFormMatchesConfig("ISR ANUAL", "isr_trimestral")).toBe(false);
    expect(taxFormMatchesConfig("ISR TRIMESTRAL", "isr_trimestral")).toBe(true);
    expect(taxFormMatchesConfig("ISR ANUAL", "isr_anual")).toBe(true);
  });
  it("otros tipos sin cambios y respaldo", () => {
    expect(taxFormMatchesConfig("IVA GENERAL", "iva")).toBe(true);
    expect(taxFormMatchesConfig("RETENCIONES IVA", "retencion_iva")).toBe(true);
    expect(taxFormMatchesConfig("IVA GENERAL", "retencion_iva")).toBe(false);
    expect(taxFormMatchesConfig("TIMBRES FISCALES", "timbres")).toBe(true);
    expect(taxFormMatchesConfig(null, "iva")).toBe(false);
  });
  it("period_month 10 coincide con el trimestre oct-dic; anual/mensual no cuentan", () => {
    const covered = coveredPeriodForDueDate(ISO, new Date(2027, 0, 29));
    expect(covered).toEqual({ periodMonth: 10, periodYear: 2026 });
    expect(isFormPresented({ tax_type: "ISO", period_type: "trimestral", period_month: 10, period_year: 2026 }, ISO, covered)).toBe(true);
    expect(isFormPresented({ tax_type: "ISO", period_type: null, period_month: 12, period_year: 2026 }, ISO, covered)).toBe(true);
    expect(isFormPresented({ tax_type: "ISO", period_type: "anual", period_month: 10, period_year: 2026 }, ISO, covered)).toBe(false);
    expect(isFormPresented({ tax_type: "ISO", period_type: "mensual", period_month: 10, period_year: 2026 }, ISO, covered)).toBe(false);
    expect(isFormPresented({ tax_type: "ISO", period_type: "trimestral", period_month: 7, period_year: 2026 }, ISO, covered)).toBe(false);
  });
  it("mensual: mes exacto", () => {
    const covered = coveredPeriodForDueDate(IVA, new Date(2026, 9, 30));
    expect(covered).toEqual({ periodMonth: 9, periodYear: 2026 });
    expect(isFormPresented(ivaForm(9), IVA, covered)).toBe(true);
    expect(isFormPresented(ivaForm(8), IVA, covered)).toBe(false);
  });
});

describe("8. feriados recurrentes en el año siguiente", () => {
  it("un feriado recurrente el 29 de enero mueve el vencimiento al día hábil anterior", () => {
    const recurring = [{ holiday_date: "2020-01-29T12:00:00", description: "Feriado", is_recurring: true }];
    const holidays = parseHolidaysForYears(recurring, 2026);
    expect(toDateOnlyString(calculateDueDate(new Date(2026, 8, 1), ISO, holidays))).toBe("2026-10-30");
    expect(toDateOnlyString(calculateDueDate(new Date(2026, 11, 1), ISO, holidays))).toBe("2027-01-28");
    // Ya visto desde el dashboard en octubre de 2026:
    const { next } = run(day(2026, 10, 7), FORMS, [ISO], holidays);
    expect(ymd(next[0])).toBe("2027-01-28");
  });
});

describe("joinLabelsEs", () => {
  it("y / e / comas", () => {
    expect(joinLabelsEs(["IVA Mensual"])).toBe("IVA Mensual");
    expect(joinLabelsEs(["IVA Mensual", "Retención ISR"])).toBe("IVA Mensual y Retención ISR");
    expect(joinLabelsEs(["ISO Trimestral", "ISR Trimestral"])).toBe("ISO Trimestral e ISR Trimestral");
    expect(joinLabelsEs(["A", "B", "C"])).toBe("A, B, C");
  });
});

describe("computePendingDeadlines con vigencia", () => {
  const ISR_MENSUAL = { tax_type: "isr_mensual", tax_label: "ISR Mensual", calculation_type: "business_days_after", days_value: 10, reference_period: "next_month", consider_holidays: true, is_active: true };
  const IVA_M = { tax_type: "iva", tax_label: "IVA Mensual", calculation_type: "last_business_day", days_value: 0, reference_period: "current_month", consider_holidays: true, is_active: true };
  const today = new Date(2026, 9, 8, 9, 30);

  it("config válida hasta 2026-04-30 y hoy 08/10/2026 => sin vencimiento para esa config", () => {
    const { inWindow, next } = computePendingDeadlines({ configs: [{ ...IVA_M, effective_to: "2026-04-30" }], holidays: [], forms: [], today });
    expect([...inWindow, ...next]).toEqual([]);
  });
  it("config sin fechas => igual que hoy", () => {
    const sinFechas = computePendingDeadlines({ configs: [IVA_M], holidays: [], forms: [], today });
    const conNull = computePendingDeadlines({ configs: [{ ...IVA_M, effective_from: null, effective_to: null }], holidays: [], forms: [], today });
    expect(conNull).toEqual(sinFechas);
    expect(sinFechas.inWindow.length + sinFechas.next.length).toBe(1);
  });
  it("vigente hasta 30/04: cuenta el que cubre abril (se paga en mayo); el de mayo no", () => {
    const cfg = { ...IVA_M, effective_to: "2026-04-30" };
    const ivaForm = (m) => ({ tax_type: "IVA GENERAL", period_type: "mensual", period_month: m, period_year: 2026 });
    const may = computePendingDeadlines({ configs: [cfg], holidays: [], forms: [ivaForm(2), ivaForm(3)], today: new Date(2026, 4, 10) });
    const all = [...may.inWindow, ...may.next];
    expect(all).toHaveLength(1);
    expect(all[0].periodLabel).toBe("Abril 2026");
    const jun = computePendingDeadlines({ configs: [cfg], holidays: [], forms: [ivaForm(3), ivaForm(4)], today: new Date(2026, 5, 10) });
    expect([...jun.inWindow, ...jun.next]).toEqual([]);
  });
  it("vigente desde 01/05: el que cubre abril no cuenta", () => {
    const cfg = { ...ISR_MENSUAL, effective_from: "2026-05-01" };
    const { inWindow, next } = computePendingDeadlines({ configs: [cfg], holidays: [], forms: [], today: new Date(2026, 4, 3) });
    expect([...inWindow, ...next].map((d) => d.periodLabel)).toEqual(["Mayo 2026"]);
  });
  it("trimestral: vigencia sobre el rango del trimestre cubierto", () => {
    const ISO_T = { tax_type: "iso", tax_label: "ISO Trimestral", calculation_type: "last_business_day", days_value: 0, reference_period: "quarter_end_next_month", consider_holidays: true, is_active: true };
    const hastaMayo = computePendingDeadlines({ configs: [{ ...ISO_T, effective_to: "2026-05-15" }], holidays: [], forms: [], today: new Date(2026, 6, 10) });
    expect([...hastaMayo.inWindow, ...hastaMayo.next].map((d) => d.periodLabel)).toEqual(["Abril - Junio 2026"]);
    const hastaMarzo = computePendingDeadlines({ configs: [{ ...ISO_T, effective_to: "2026-03-31" }], holidays: [], forms: [], today: new Date(2026, 6, 10) });
    expect([...hastaMarzo.inWindow, ...hastaMarzo.next]).toEqual([]);
  });
});

describe("computeDueDateAlerts (alertas de vencimiento)", () => {
  const on = () => ({ is_enabled: true, days_before: 5 });
  const alerts = (today, forms, configs, alertConfigFor = on) =>
    computeDueDateAlerts({ configs, holidays: [], forms, today, alertConfigFor });

  it("1. ISR trimestral: alerta 30/10/2026 por Julio - Septiembre; con el formulario, ninguna", () => {
    const out = alerts(day(2026, 10, 26), [], [ISR]);
    expect(out).toHaveLength(1);
    expect(ymd(out[0])).toBe("2026-10-30");
    expect(out[0]).toMatchObject({ taxType: "isr_trimestral", label: "ISR Trimestral", daysUntil: 4, priority: "importante", periodLabel: "Julio - Septiembre 2026" });
    expect(alerts(day(2026, 10, 26), [ISR_Q3], [ISR])).toEqual([]);
  });

  it("2. ISO con formulario 'IMPUESTO DE SOLIDARIDAD' (julio 2026): ninguna", () => {
    expect(alerts(day(2026, 10, 26), [], [ISO])).toHaveLength(1);
    expect(alerts(day(2026, 10, 26), [ISO_Q3], [ISO])).toEqual([]);
  });

  it("3. IVA mensual: alerta 30/10 por Septiembre; presentado, ninguna; −1 día sí; 02/11 no", () => {
    const out = alerts(day(2026, 10, 27), [], [IVA]);
    expect(out.map(ymd)).toEqual(["2026-10-30"]);
    expect(out[0].periodLabel).toBe("Septiembre 2026");
    expect(alerts(day(2026, 10, 27), [ivaForm(9)], [IVA])).toEqual([]);
    const late = alerts(day(2026, 10, 31), [], [IVA]);
    expect(late.map(ymd)).toEqual(["2026-10-30"]);
    expect(late[0]).toMatchObject({ daysUntil: -1, priority: "urgente" });
    expect(alerts(day(2026, 11, 2), [], [IVA])).toEqual([]);
  });

  it("4. IVA vigente hasta 30/04/2026: alerta por Abril en mayo; en junio ninguna", () => {
    const iva = { ...IVA, effective_to: "2026-04-30" };
    const may = alerts(day(2026, 5, 27), [], [iva]);
    expect(may.map(ymd)).toEqual(["2026-05-29"]);
    expect(may[0].periodLabel).toBe("Abril 2026");
    expect(alerts(day(2026, 6, 26), [], [iva])).toEqual([]);
    expect(alerts(day(2026, 6, 26), [], [IVA])).toHaveLength(1);
  });

  it("5. alerta deshabilitada: ninguna", () => {
    expect(alerts(day(2026, 10, 27), [], [IVA], () => ({ is_enabled: false, days_before: 5 }))).toEqual([]);
  });

  it("config inactiva: ninguna", () => {
    expect(alerts(day(2026, 10, 27), [], [{ ...IVA, is_active: false }])).toEqual([]);
  });

  it("6. con getDefaultTaxConfigs, 'iso' es trimestral (sin alertas mensuales)", () => {
    const defaults = getDefaultTaxConfigs().map((c) => ({ ...c, is_active: true }));
    expect(defaults.find((c) => c.tax_type === "iso").reference_period).toBe("quarter_end_next_month");
    // 27/11/2026: el IVA de octubre vence el 30/11; el ISO ya no.
    const nov = alerts(day(2026, 11, 27), [], defaults);
    expect(nov.some((a) => a.taxType === "iso")).toBe(false);
    expect(nov.some((a) => a.taxType === "iva")).toBe(true);
    // 26/10/2026: el ISO del tercer trimestre sí.
    const oct = alerts(day(2026, 10, 26), [], defaults).filter((a) => a.taxType === "iso");
    expect(oct.map((a) => [ymd(a), a.periodLabel])).toEqual([["2026-10-30", "Julio - Septiembre 2026"]]);
  });
});

describe("isTaxAlertStale", () => {
  const stale = (notificationType, eventDate, { configs = CONFIGS, forms = [], today = day(2026, 10, 27), staleDays } = {}) =>
    isTaxAlertStale({ notificationType, eventDate, configs, forms, today, staleDays });

  it("vigente y sin presentar: no sobra", () => {
    expect(stale("vencimiento_iva", "2026-10-30")).toBe(false);
    expect(stale("vencimiento_isr_trimestral", "2026-10-30")).toBe(false);
  });
  it("formulario presentado (mensual y trimestral)", () => {
    expect(stale("vencimiento_iva", "2026-10-30", { forms: [ivaForm(9)] })).toBe(true);
    expect(stale("vencimiento_isr_trimestral", "2026-10-30", { forms: [ISR_Q3] })).toBe(true);
    expect(stale("vencimiento_iso", "2026-10-30", { forms: [ISO_Q3] })).toBe(true);
  });
  it("config inexistente o inactiva", () => {
    expect(stale("vencimiento_retenciones_iva", "2026-10-15")).toBe(true);
    expect(stale("vencimiento_iva", "2026-10-30", { configs: [{ ...IVA, is_active: false }] })).toBe(true);
  });
  it("vigencia que ya no cubre el período", () => {
    const configs = [{ ...IVA, effective_to: "2026-04-30" }];
    expect(stale("vencimiento_iva", "2026-05-29", { configs, today: day(2026, 5, 27) })).toBe(false);
    expect(stale("vencimiento_iva", "2026-06-30", { configs, today: day(2026, 6, 26) })).toBe(true);
  });
  it("vencida hace más de staleDays días", () => {
    expect(stale("vencimiento_iva", "2026-08-31", { today: day(2026, 10, 30) })).toBe(false); // 60 días
    expect(stale("vencimiento_iva", "2026-08-31", { today: day(2026, 10, 31) })).toBe(true); // 61 días
    expect(stale("vencimiento_iva", "2026-10-01", { staleDays: 20 })).toBe(true);
  });
});

/**
 * Run with: bunx vitest run src/utils/dashboardIsrTrimestral.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  lastCompletedQuarter, findPresentedIsrTrimestralForm, buildIsrTrimestralSummary,
} from "./dashboardIsrTrimestral";
import { parseIsrTrimestralResult } from "./declarationCalculations";

// Cálculo guardado id 16, empresa 26, T3 2026.
const RESULT_16 = {
  trimestre: 3, trimestreLabel: "3 (julio a septiembre)", fechaInicio: "2026-01-01", fechaFin: "2026-09-30",
  ingresos: 175332.9, costoVentas: 167368.83, gastosOperacion: 11500.94, rentaImponible: -3536.87,
  isrCalculado: 0, isrPagadoAnterior: 0, isrAPagar: 0, tasaImpuesto: 25,
};
const SAVED_16 = { id: 16, createdAt: "2026-10-07T22:00:00Z", ...parseIsrTrimestralResult(RESULT_16) };
const T3 = { quarter: 3, year: 2026, startMonth: 7, endMonth: 9 };

describe("(a) lastCompletedQuarter", () => {
  it("fechas del enunciado", () => {
    expect(lastCompletedQuarter(new Date(2026, 9, 7))).toEqual(T3);
    expect(lastCompletedQuarter(new Date(2027, 0, 15))).toEqual({ quarter: 4, year: 2026, startMonth: 10, endMonth: 12 });
    expect(lastCompletedQuarter(new Date(2026, 3, 20))).toEqual({ quarter: 1, year: 2026, startMonth: 1, endMonth: 3 });
    expect(lastCompletedQuarter(new Date(2026, 11, 31))).toEqual(T3);
  });
  it("julio => T2", () => {
    expect(lastCompletedQuarter(new Date(2026, 6, 1))).toMatchObject({ quarter: 2, startMonth: 4 });
  });
});

describe("(b) findPresentedIsrTrimestralForm", () => {
  const form = (tax_type, period_month, extra = {}) => ({
    tax_type, period_type: "trimestral", period_month, period_year: 2026,
    form_number: "123456", amount_paid: "0", payment_date: "2026-10-07", is_active: true, ...extra,
  });
  it("ISR TRIMESTRAL de julio coincide con T3", () => {
    expect(findPresentedIsrTrimestralForm([form("ISR TRIMESTRAL", 7)], 2026, 7)).toEqual({
      formNumber: "123456", amountPaid: 0, paymentDate: "2026-10-07",
    });
  });
  it("ISR ANUAL, ISR MENSUAL, mes 4, otro año o inactivo no coinciden", () => {
    expect(findPresentedIsrTrimestralForm([form("ISR ANUAL", 7)], 2026, 7)).toBeNull();
    expect(findPresentedIsrTrimestralForm([form("ISR MENSUAL", 7)], 2026, 7)).toBeNull();
    expect(findPresentedIsrTrimestralForm([form("ISR TRIMESTRAL", 4)], 2026, 7)).toBeNull();
    expect(findPresentedIsrTrimestralForm([form("ISR TRIMESTRAL", 7, { period_year: 2025 })], 2026, 7)).toBeNull();
    expect(findPresentedIsrTrimestralForm([form("ISR TRIMESTRAL", 7, { is_active: false })], 2026, 7)).toBeNull();
  });
  it("mes dentro del trimestre y sin acentos", () => {
    expect(findPresentedIsrTrimestralForm([form("Isr Trimestral (régimen utilidades)", 9)], 2026, 7)).not.toBeNull();
  });
});

describe("(c) buildIsrTrimestralSummary", () => {
  const today = new Date(2026, 9, 8, 10, 0);
  it("con guardado y pendiente (empresa 26)", () => {
    const s = buildIsrTrimestralSummary({ quarter: T3, saved: SAVED_16, presentedForm: null, dueDate: new Date(2026, 9, 30), today, rate: 25 });
    expect(s).toMatchObject({
      state: "pending", hasSaved: true, ingresos: 175332.9, costoVentas: 167368.83, gastosOperacion: 11500.94,
      rentaImponible: -3536.87, isrAPagar: 0, rate: 25, savedCalcId: 16, daysUntil: 22, isOverdue: false,
    });
  });
  it("sin guardado => pending sin cálculo y tasa de la configuración", () => {
    const s = buildIsrTrimestralSummary({ quarter: T3, saved: null, presentedForm: null, dueDate: null, today, rate: 25 });
    expect(s).toMatchObject({ state: "pending", hasSaved: false, isrAPagar: 0, rate: 25, dueDate: null, daysUntil: null, isOverdue: false });
  });
  it("con formulario presentado => presented", () => {
    const presentedForm = { formNumber: "999", amountPaid: 0, paymentDate: "2026-10-07" };
    const s = buildIsrTrimestralSummary({ quarter: T3, saved: SAVED_16, presentedForm, dueDate: null, today, rate: 25 });
    expect(s.state).toBe("presented");
    expect(s.presentedForm).toEqual(presentedForm);
  });
  it("vencido => isOverdue y días negativos", () => {
    const s = buildIsrTrimestralSummary({ quarter: T3, saved: null, presentedForm: null, dueDate: new Date(2026, 9, 30), today: new Date(2026, 10, 2), rate: 25 });
    expect(s.isOverdue).toBe(true);
    expect(s.daysUntil).toBe(-3);
  });
});

describe("(d) parseIsrTrimestralResult", () => {
  it("ejemplo id 16", () => {
    expect(parseIsrTrimestralResult(RESULT_16)).toEqual({
      ingresos: 175332.9, costoVentas: 167368.83, gastosOperacion: 11500.94, rentaImponible: -3536.87,
      isrCalculado: 0, isrPagadoAnterior: 0, isrAPagar: 0, tasaImpuesto: 25, trimestre: 3,
    });
  });
  it("null y basura => ceros", () => {
    const zeros = { ingresos: 0, costoVentas: 0, gastosOperacion: 0, rentaImponible: 0, isrCalculado: 0, isrPagadoAnterior: 0, isrAPagar: 0, tasaImpuesto: 0, trimestre: 0 };
    for (const v of [null, undefined, "x", 3, [], { ingresos: "100", isrAPagar: NaN }]) {
      expect(parseIsrTrimestralResult(v)).toEqual(zeros);
    }
  });
});

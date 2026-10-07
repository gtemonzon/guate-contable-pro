/**
 * Run with: bunx vitest run src/utils/dashboardIsrMensualSummary.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { buildIsrMensualSummary } from "./dashboardIsrMensualSummary";
import { parseIsrMensualResult } from "./declarationCalculations";

const SAVED = {
  id: 31,
  createdAt: "2026-10-07T20:00:00Z",
  ...parseIsrMensualResult({
    ingresosBrutos: 45000, primerTramo: 30000, segundoTramo: 15000,
    isrBruto: 2550, retencionRealizada: 600, isrAPagar: 1950,
  }),
};
const ESTIMATE_45K = { ingresosBrutos: 45000, primerTramo: 1500, segundoTramo: 1050, isrCalculado: 2550 };

describe("buildIsrMensualSummary", () => {
  it("(a) guardado vigente: impuesto por tramo, retención e ISR a pagar del guardado", () => {
    const s = buildIsrMensualSummary({ estimate: ESTIMATE_45K, liveComparable: 45000.4, saved: SAVED });
    expect(s).toMatchObject({
      source: "saved", ingresos: 45000, isrBruto: 2550, retention: 600, isrToPay: 1950,
      stale: false, savedCalcId: 31, savedAt: "2026-10-07T20:00:00Z",
    });
    expect(s.tax1).toBeCloseTo(1500, 6);
    expect(s.tax2).toBeCloseTo(1050, 6);
  });
  it("(b) mismo guardado con ingresos en vivo 47,000 => desactualizado", () => {
    expect(buildIsrMensualSummary({ estimate: ESTIMATE_45K, liveComparable: 47000, saved: SAVED }).stale).toBe(true);
  });
  it("(c) sin guardado: valores de hoy y retención 0", () => {
    expect(buildIsrMensualSummary({ estimate: ESTIMATE_45K, liveComparable: 46000, saved: null })).toEqual({
      source: "estimate", ingresos: 45000, tax1: 1500, tax2: 1050, isrBruto: 2550,
      retention: 0, isrToPay: 2550, savedAt: null, savedCalcId: null, stale: false,
    });
  });
  it("(d) ingresos <= 30,000 => segundo tramo 0", () => {
    const saved = { id: 1, createdAt: "2026-10-01T00:00:00Z", ...parseIsrMensualResult({
      ingresosBrutos: 20000, primerTramo: 20000, segundoTramo: 0, isrBruto: 1000, retencionRealizada: 0, isrAPagar: 1000,
    }) };
    const s = buildIsrMensualSummary({ estimate: ESTIMATE_45K, liveComparable: 20000, saved });
    expect(s.tax1).toBeCloseTo(1000, 6);
    expect(s.tax2).toBe(0);
    const est = buildIsrMensualSummary({
      estimate: { ingresosBrutos: 20000, primerTramo: 1000, segundoTramo: 0, isrCalculado: 1000 },
      liveComparable: 20000, saved: null,
    });
    expect(est.tax2).toBe(0);
  });
  it("(e) parser con null y basura => ceros", () => {
    const zeros = { ingresosBrutos: 0, primerTramo: 0, segundoTramo: 0, isrBruto: 0, retencionRealizada: 0, isrAPagar: 0 };
    for (const v of [null, undefined, "x", 7, [], { ingresosBrutos: "45000", isrAPagar: NaN }]) {
      expect(parseIsrMensualResult(v)).toEqual(zeros);
    }
  });
});

/**
 * Run with: bunx vitest run src/utils/dashboardIvaSummary.test.ts
 */
import { describe, it, expect } from "vitest";
import { buildIvaGeneralSummary, buildIvaPequenoSummary } from "./dashboardIvaSummary";
import { parseIvaGeneralResult, parseIvaPequenoResult } from "./declarationCalculations";

// Cálculo guardado id 14, empresa 26, septiembre 2026.
const SAVED_14 = {
  id: 14,
  createdAt: "2026-10-08T00:22:30Z",
  ...parseIvaGeneralResult({
    debitoFiscal: 2867, creditoFiscal: 1497, creditoRemanente: 1530, exencionIVA: 0,
    ivaAPagar: 0, creditoRemanenteProximoMes: 159, otrosCampos: "ignorados",
  }),
};

describe("buildIvaGeneralSummary", () => {
  it("(a) guardado y vigente (empresa 26)", () => {
    const s = buildIvaGeneralSummary({ salesVat: 2867.4, purchasesVat: 1497.2, saved: SAVED_14, suggestedCarryover: 999 });
    expect(s).toMatchObject({
      source: "saved", debit: 2867, credit: 1497, carryoverIn: 1530, exemption: 0,
      ivaToPay: 0, carryoverOut: 159, ivaBalance: -159, stale: false,
      savedCalcId: 14, savedAt: "2026-10-08T00:22:30Z",
    });
  });
  it("(b) mismo guardado con compras en vivo 1600 => desactualizado", () => {
    const s = buildIvaGeneralSummary({ salesVat: 2867.4, purchasesVat: 1600, saved: SAVED_14, suggestedCarryover: 0 });
    expect(s.stale).toBe(true);
    expect(s.ivaBalance).toBe(-159);
  });
  it("(c) sin guardado, remanente sugerido 1530 => crédito 160", () => {
    const s = buildIvaGeneralSummary({ salesVat: 2867.4, purchasesVat: 1497.2, saved: null, suggestedCarryover: 1530 });
    expect(s.source).toBe("estimate");
    expect(s.ivaToPay).toBe(0);
    expect(s.carryoverOut).toBeCloseTo(159.8, 6);
    expect(Math.round(s.carryoverOut)).toBe(160);
    expect(s.ivaBalance).toBeCloseTo(-159.8, 6);
    expect(s.stale).toBe(false);
  });
  it("(d) sin guardado ni remanente => 1370.2 por pagar (como antes)", () => {
    const s = buildIvaGeneralSummary({ salesVat: 2867.4, purchasesVat: 1497.2, saved: null, suggestedCarryover: 0 });
    expect(s.ivaToPay).toBeCloseTo(1370.2, 6);
    expect(s.carryoverOut).toBe(0);
    expect(s.ivaBalance).toBeCloseTo(1370.2, 6);
  });
  it("(e) guardado con exención: manda el impuesto guardado", () => {
    const saved = { id: 20, createdAt: "2026-10-01T10:00:00Z", ...parseIvaGeneralResult({
      debitoFiscal: 5000, creditoFiscal: 1000, creditoRemanente: 0, exencionIVA: 1500, ivaAPagar: 2500, creditoRemanenteProximoMes: 0,
    }) };
    const s = buildIvaGeneralSummary({ salesVat: 5000, purchasesVat: 1000, saved, suggestedCarryover: 0 });
    expect(s).toMatchObject({ exemption: 1500, ivaToPay: 2500, carryoverOut: 0, ivaBalance: 2500, stale: false });
  });
  it("sin impuesto ni crédito => balance 0", () => {
    const s = buildIvaGeneralSummary({ salesVat: 100, purchasesVat: 100, saved: null, suggestedCarryover: 0 });
    expect(s.ivaBalance).toBe(0);
  });
});

describe("(f) buildIvaPequenoSummary", () => {
  const saved = { id: 7, createdAt: "2026-10-02T15:00:00Z", ...parseIvaPequenoResult({
    totalIngresos: 20000, tasaImpuesto: 5, retencionIVARealizada: 300, impuestoAPagar: 700,
  }) };
  it("con guardado vigente", () => {
    expect(buildIvaPequenoSummary({ liveIngresos: 20000.4, rate: 5, saved })).toMatchObject({
      source: "saved", ingresos: 20000, rate: 5, retention: 300, tax: 700, stale: false, savedCalcId: 7,
    });
  });
  it("con guardado desactualizado", () => {
    expect(buildIvaPequenoSummary({ liveIngresos: 21000, rate: 5, saved }).stale).toBe(true);
  });
  it("estimado con la tasa real", () => {
    expect(buildIvaPequenoSummary({ liveIngresos: 20000, rate: 4, saved: null })).toMatchObject({
      source: "estimate", ingresos: 20000, rate: 4, retention: 0, tax: 800, stale: false,
    });
  });
});

describe("(g) parsers", () => {
  const zerosG = { debitoFiscal: 0, creditoFiscal: 0, creditoRemanente: 0, exencionIVA: 0, ivaAPagar: 0, creditoRemanenteProximoMes: 0 };
  const zerosP = { totalIngresos: 0, tasaImpuesto: 0, retencionIVARealizada: 0, impuestoAPagar: 0 };
  it("null y basura => 0", () => {
    for (const v of [null, undefined, "x", 42, [1, 2], { debitoFiscal: "10", ivaAPagar: NaN, creditoFiscal: Infinity }]) {
      expect(parseIvaGeneralResult(v)).toEqual(zerosG);
    }
    for (const v of [null, "x", [], { totalIngresos: "5", tasaImpuesto: null }]) {
      expect(parseIvaPequenoResult(v)).toEqual(zerosP);
    }
  });
});

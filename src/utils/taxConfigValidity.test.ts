/**
 * Run with: bunx vitest run src/utils/taxConfigValidity.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  isTaxConfigValidForMonth, isTaxConfigValidForRange, isTaxConfigValidOn, describeValidity, isValidityRangeOk,
} from "./taxConfigValidity";

const hasta = { is_active: true, effective_from: null, effective_to: "2026-04-30" };
const desde = { is_active: true, effective_from: "2026-05-01", effective_to: null };
const libre = { is_active: true, effective_from: null, effective_to: null };

describe("isTaxConfigValidForMonth", () => {
  it("fin 2026-04-30: válido en abril, no en mayo", () => {
    expect(isTaxConfigValidForMonth(hasta, 2026, 4)).toBe(true);
    expect(isTaxConfigValidForMonth(hasta, 2026, 5)).toBe(false);
    expect(isTaxConfigValidForMonth(hasta, 2025, 12)).toBe(true);
  });
  it("inicio 2026-05-01: válido en mayo, no en abril", () => {
    expect(isTaxConfigValidForMonth(desde, 2026, 5)).toBe(true);
    expect(isTaxConfigValidForMonth(desde, 2026, 4)).toBe(false);
    expect(isTaxConfigValidForMonth(desde, 2026, 9)).toBe(true);
  });
  it("NULL en ambos extremos (o sin columnas): siempre", () => {
    expect(isTaxConfigValidForMonth(libre, 2000, 1)).toBe(true);
    expect(isTaxConfigValidForMonth({ is_active: true }, 2099, 12)).toBe(true);
  });
  it("vigencia a mitad de mes cuenta para ese mes", () => {
    expect(isTaxConfigValidForMonth({ is_active: true, effective_from: "2026-05-15" }, 2026, 5)).toBe(true);
    expect(isTaxConfigValidForMonth({ is_active: true, effective_to: "2026-05-15" }, 2026, 5)).toBe(true);
  });
  it("inactivo nunca", () => {
    expect(isTaxConfigValidForMonth({ ...libre, is_active: false }, 2026, 5)).toBe(false);
    expect(isTaxConfigValidForMonth({ is_active: null }, 2026, 5)).toBe(false);
  });
  it("febrero bisiesto", () => {
    expect(isTaxConfigValidForMonth({ is_active: true, effective_from: "2028-02-29" }, 2028, 2)).toBe(true);
  });
});

describe("isTaxConfigValidForRange (trimestres)", () => {
  it("trimestre que cruza el fin: abr–jun con fin 30/04 => válido; jul–sep no", () => {
    expect(isTaxConfigValidForRange(hasta, 2026, 4, 6)).toBe(true);
    expect(isTaxConfigValidForRange(hasta, 2026, 7, 9)).toBe(false);
  });
  it("trimestre que cruza el inicio: abr–jun con inicio 01/05 => válido; ene–mar no", () => {
    expect(isTaxConfigValidForRange(desde, 2026, 4, 6)).toBe(true);
    expect(isTaxConfigValidForRange(desde, 2026, 1, 3)).toBe(false);
  });
  it("inactivo nunca", () => {
    expect(isTaxConfigValidForRange({ ...libre, is_active: false }, 2026, 1, 3)).toBe(false);
  });
});

describe("isTaxConfigValidOn", () => {
  it("bordes inclusivos", () => {
    expect(isTaxConfigValidOn(hasta, "2026-04-30")).toBe(true);
    expect(isTaxConfigValidOn(hasta, "2026-05-01")).toBe(false);
    expect(isTaxConfigValidOn(desde, new Date(2026, 4, 1, 23, 59))).toBe(true);
    expect(isTaxConfigValidOn(desde, new Date(2026, 3, 30, 23, 59))).toBe(false);
  });
});

describe("describeValidity / isValidityRangeOk", () => {
  it("textos", () => {
    expect(describeValidity(libre)).toBe("Sin límite");
    expect(describeValidity(desde)).toBe("Desde 01/05/2026");
    expect(describeValidity(hasta)).toBe("Hasta 30/04/2026");
    expect(describeValidity({ effective_from: "2026-01-01", effective_to: "2026-04-30" })).toBe("01/01/2026 – 30/04/2026");
  });
  it("Hasta no puede ser anterior a Desde", () => {
    expect(isValidityRangeOk({ effective_from: "2026-05-01", effective_to: "2026-04-30" })).toBe(false);
    expect(isValidityRangeOk({ effective_from: "2026-05-01", effective_to: "2026-05-01" })).toBe(true);
    expect(isValidityRangeOk(desde)).toBe(true);
  });
});

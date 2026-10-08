/**
 * Run with: bunx vitest run src/utils/taxConfigValidity.test.ts
 */
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

import {
  isFormConfigValidForPeriod, validFormTypesForPeriod, isFormConfigValidForDashboard, chooseAutoFormType,
} from "./taxConfigValidity";

// Empresa 25: ISR_MENSUAL e IVA_GENERAL hasta 30/04/2026; IVA_PEQUENO desde 01/05/2026.
const E25 = [
  { tax_form_type: "IVA_GENERAL", is_active: true, effective_to: "2026-04-30" },
  { tax_form_type: "IVA_PEQUENO", is_active: true, effective_from: "2026-05-01" },
  { tax_form_type: "ISR_MENSUAL", is_active: true, effective_to: "2026-04-30" },
];

describe("por tipo de formulario", () => {
  it("validFormTypesForPeriod: abril => IVA General e ISR Mensual; septiembre => solo IVA Pequeño", () => {
    expect(validFormTypesForPeriod(E25, 2026, 4)).toEqual(["IVA_GENERAL", "ISR_MENSUAL"]);
    expect(validFormTypesForPeriod(E25, 2026, 9)).toEqual(["IVA_PEQUENO"]);
  });
  it("trimestrales: el trimestre que contiene el mes", () => {
    const isr = { tax_form_type: "ISR_TRIMESTRAL", is_active: true, effective_to: "2026-04-30" };
    expect(isFormConfigValidForPeriod(isr, 2026, 6)).toBe(true);  // abr–jun
    expect(isFormConfigValidForPeriod(isr, 2026, 7)).toBe(false); // jul–sep
  });
  it("dashboard: mensual = mes anterior; trimestral = último trimestre terminado", () => {
    const today = new Date(2026, 9, 8); // 08/10/2026 → septiembre y T3
    expect(isFormConfigValidForDashboard(E25[2], today)).toBe(false);
    expect(isFormConfigValidForDashboard(E25[1], today)).toBe(true);
    expect(isFormConfigValidForDashboard(E25[2], new Date(2026, 4, 5))).toBe(true); // mayo → abril
    const isrT = { tax_form_type: "ISR_TRIMESTRAL", is_active: true, effective_from: "2026-07-01" };
    expect(isFormConfigValidForDashboard(isrT, today)).toBe(true);
    expect(isFormConfigValidForDashboard(isrT, new Date(2026, 6, 8))).toBe(false); // julio → T2
    expect(isFormConfigValidForDashboard({ ...isrT, effective_from: null }, new Date(2027, 0, 10))).toBe(true); // enero → T4 del año anterior
  });
  it("chooseAutoFormType", () => {
    // Septiembre: regimen pequeño, IVA_GENERAL ya no vigente → IVA_PEQUENO.
    expect(chooseAutoFormType({ current: "IVA_GENERAL", validTypes: ["IVA_PEQUENO"], regimeFormType: "IVA_PEQUENO" })).toBe("IVA_PEQUENO");
    // Abril: régimen general → IVA_GENERAL.
    expect(chooseAutoFormType({ current: null, validTypes: ["IVA_GENERAL", "ISR_MENSUAL"], regimeFormType: "IVA_GENERAL" })).toBe("IVA_GENERAL");
    // Sin régimen conocido: el primero vigente.
    expect(chooseAutoFormType({ current: "IVA_GENERAL", validTypes: ["IVA_PEQUENO"], regimeFormType: null })).toBe("IVA_PEQUENO");
    // Un no-IVA vigente se conserva.
    expect(chooseAutoFormType({ current: "ISR_MENSUAL", validTypes: ["IVA_GENERAL", "ISR_MENSUAL"], regimeFormType: "IVA_GENERAL" })).toBe("ISR_MENSUAL");
    // Un no-IVA que deja de ser vigente cambia.
    expect(chooseAutoFormType({ current: "ISR_MENSUAL", validTypes: ["IVA_PEQUENO"], regimeFormType: "IVA_PEQUENO" })).toBe("IVA_PEQUENO");
    // Nada vigente.
    expect(chooseAutoFormType({ current: "ISR_MENSUAL", validTypes: [], regimeFormType: "IVA_PEQUENO" })).toBeNull();
  });
});

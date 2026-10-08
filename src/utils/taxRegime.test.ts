/**
 * Run with: bunx vitest run src/utils/taxRegime.test.ts
 */
import { describe, it, expect } from "vitest";
import { ivaFormTypeForRegime, regimeAsOfDateForMonth } from "./taxRegime";

describe("ivaFormTypeForRegime", () => {
  it("valores del sistema", () => {
    expect(ivaFormTypeForRegime("pequeño_contribuyente")).toBe("IVA_PEQUENO");
    expect(ivaFormTypeForRegime("contribuyente_general")).toBe("IVA_GENERAL");
    expect(ivaFormTypeForRegime("exenta_ong")).toBeNull();
  });
  it("sin acentos y mayúsculas", () => {
    expect(ivaFormTypeForRegime("PEQUENO_CONTRIBUYENTE")).toBe("IVA_PEQUENO");
    expect(ivaFormTypeForRegime("Pequeño Contribuyente")).toBe("IVA_PEQUENO");
    expect(ivaFormTypeForRegime("Régimen General")).toBe("IVA_GENERAL");
  });
  it("null, vacío o desconocido", () => {
    expect(ivaFormTypeForRegime(null)).toBeNull();
    expect(ivaFormTypeForRegime(undefined)).toBeNull();
    expect(ivaFormTypeForRegime("")).toBeNull();
    expect(ivaFormTypeForRegime("otro")).toBeNull();
  });
});

describe("regimeAsOfDateForMonth (último día del mes, como LibrosFiscales)", () => {
  it("fin de mes", () => {
    expect(regimeAsOfDateForMonth(2026, 9)).toBe("2026-09-30");
    expect(regimeAsOfDateForMonth(2026, 2)).toBe("2026-02-28");
    expect(regimeAsOfDateForMonth(2028, 2)).toBe("2028-02-29");
    expect(regimeAsOfDateForMonth(2026, 12)).toBe("2026-12-31");
  });
  it("empresa 25: junio en adelante pequeño (desde 2026-06-01); mayo aún general", () => {
    expect(regimeAsOfDateForMonth(2026, 6) >= "2026-06-01").toBe(true);
    expect(regimeAsOfDateForMonth(2026, 5) >= "2026-06-01").toBe(false);
  });
});

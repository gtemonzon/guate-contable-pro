import { describe, it, expect } from "vitest";
import { deriveTenantPaletteVars, DEFAULT_TENANT_PRIMARY, DEFAULT_TENANT_SECONDARY } from "./colorUtils";

describe("deriveTenantPaletteVars", () => {
  it("colores por defecto => {}", () => {
    expect(deriveTenantPaletteVars(DEFAULT_TENANT_PRIMARY, DEFAULT_TENANT_SECONDARY)).toEqual({});
    expect(deriveTenantPaletteVars(null, undefined)).toEqual({});
  });
  it("primario verde limita saturación a 70", () => {
    expect(deriveTenantPaletteVars("#16a34a", DEFAULT_TENANT_SECONDARY)).toEqual({ "--tenant-h": "142", "--tenant-s": "70%" });
  });
  it("gris conserva saturación 0", () => {
    expect(deriveTenantPaletteVars("#808080", null)).toEqual({ "--tenant-h": "0", "--tenant-s": "0%" });
  });
  it("hex inválido => {}", () => {
    expect(deriveTenantPaletteVars("#zzzzzz", "nope")).toEqual({});
  });
  it("solo secundario personalizado", () => {
    const vars = deriveTenantPaletteVars(DEFAULT_TENANT_PRIMARY, "#16a34a");
    expect(Object.keys(vars).sort()).toEqual(["--tenant-2-h", "--tenant-2-s"]);
  });
  it("normaliza forma corta", () => {
    expect(deriveTenantPaletteVars("#abc", null)).toEqual(deriveTenantPaletteVars("#aabbcc", null));
    expect(deriveTenantPaletteVars("#abc", null)["--tenant-h"]).toBe("210");
  });
});

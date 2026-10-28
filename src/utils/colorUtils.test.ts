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

import { deriveTenantThemeVars, contrastRatio } from "./colorUtils";

describe("deriveTenantThemeVars", () => {
  it("colores por defecto => {}", () => {
    expect(deriveTenantThemeVars(DEFAULT_TENANT_PRIMARY, DEFAULT_TENANT_SECONDARY)).toEqual({});
  });
  it("verde oscuro: texto blanco y oscuro con L 62–78", () => {
    const v = deriveTenantThemeVars("#33721d", DEFAULT_TENANT_SECONDARY);
    expect(v["--tenant-primary-fg"]).toBe("0 0% 100%");
    const l = Number(v["--tenant-primary-dark"].split(" ")[2].replace("%", ""));
    expect(l).toBeGreaterThanOrEqual(62);
    expect(l).toBeLessThanOrEqual(78);
  });
  it("primario claro => texto casi negro", () => {
    expect(deriveTenantThemeVars("#8dde8c", null)["--tenant-primary-fg"]).toBe("0 0% 7%");
  });
  it("contraste", () => {
    expect(Math.round(contrastRatio("#000000", "#ffffff"))).toBe(21);
    expect(contrastRatio("#33721d", "#33721d")).toBe(1);
  });
  it("acento del secundario o del primario", () => {
    expect(deriveTenantThemeVars("#33721d", "#ff0000")["--tenant-accent"]).toBe("0 70% 94%");
    const onlyP = deriveTenantThemeVars("#33721d", DEFAULT_TENANT_SECONDARY);
    expect(onlyP["--tenant-accent"].split(" ")[0]).toBe("104");
  });
  it("hex inválido => {}", () => {
    expect(deriveTenantThemeVars("#zzzzzz", "nope")).toEqual({});
  });
  it("gris conserva saturación baja", () => {
    const v = deriveTenantThemeVars("#808080", null);
    expect(v["--tenant-accent"]).toBe("0 0% 94%");
    expect(v["--tenant-accent-fg-dark"]).toBe("0 0% 82%");
  });
});

describe("normalizeHex (validación de colores del tenant)", () => {
  it("expande #abc y acepta hex sin #", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("1e40af")).toBe("#1e40af");
  });
  it("rechaza valores inválidos", () => {
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("verde")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

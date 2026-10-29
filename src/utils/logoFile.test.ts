import { describe, it, expect } from "vitest";
import { buildLogoPath, logoExtension, validateLogoFile } from "./logoFile";

describe("validateLogoFile", () => {
  it("rechaza archivos de 3 MB", () => {
    expect(validateLogoFile({ type: "image/png", size: 3 * 1024 * 1024 })).toBe("El archivo es muy grande (máximo 2 MB).");
  });
  it("rechaza gif", () => {
    expect(validateLogoFile({ type: "image/gif", size: 100 })).toBe("Formato no permitido. Usa PNG, JPG, WEBP o SVG.");
  });
  it("acepta png, jpeg, webp y svg", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(validateLogoFile({ type: t, size: 1000 })).toBeNull();
    }
  });
});

describe("logoExtension y buildLogoPath", () => {
  it("extensiones correctas", () => {
    expect(logoExtension("image/png")).toBe("png");
    expect(logoExtension("image/jpeg")).toBe("jpg");
    expect(logoExtension("image/webp")).toBe("webp");
    expect(logoExtension("image/svg+xml")).toBe("svg");
    expect(() => logoExtension("image/gif")).toThrow();
  });
  it("arma la ruta del tenant", () => {
    const p = buildLogoPath("ASC", { type: "image/png" }, 1799999999999);
    expect(p).toBe("logos/asc-1799999999999.png");
    expect(p).toMatch(/^logos\/asc-[0-9]{10,16}\.[A-Za-z0-9]{2,5}$/);
    expect(buildLogoPath("ASC", { type: "image/svg+xml" })).toMatch(/^logos\/asc-[0-9]{10,16}\.[A-Za-z0-9]{2,5}$/);
  });
});

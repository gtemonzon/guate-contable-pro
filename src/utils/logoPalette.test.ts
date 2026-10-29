import { describe, it, expect } from "vitest";
import { extractPaletteFromPixels, suggestTenantColors } from "./logoPalette";
import { hexToRgb, hexToHsl } from "./colorUtils";

function makeImage(parts: { hex: string; ratio: number; alpha?: number }[], size = 100) {
  const n = size * size;
  const data = new Uint8ClampedArray(n * 4);
  let i = 0;
  for (const p of parts) {
    const rgb = hexToRgb(p.hex)!;
    const count = Math.round(n * p.ratio);
    for (let k = 0; k < count && i < n; k++, i++) {
      data.set([rgb.r, rgb.g, rgb.b, p.alpha ?? 255], i * 4);
    }
  }
  return { data, width: size, height: size };
}

function near(a: string, b: string, tol = 12) {
  const x = hexToRgb(a)!, y = hexToRgb(b)!;
  return Math.abs(x.r - y.r) <= tol && Math.abs(x.g - y.g) <= tol && Math.abs(x.b - y.b) <= tol;
}

describe("extractPaletteFromPixels", () => {
  it("verde, naranja y blanco => verde, naranja, sin blanco", () => {
    const img = makeImage([
      { hex: "#33721d", ratio: 0.6 },
      { hex: "#f5a623", ratio: 0.25 },
      { hex: "#ffffff", ratio: 0.15 },
    ]);
    const pal = extractPaletteFromPixels(img.data, img.width, img.height);
    expect(near(pal[0], "#33721d")).toBe(true);
    expect(near(pal[1], "#f5a623")).toBe(true);
    expect(pal.some((c) => near(c, "#ffffff", 20))).toBe(false);
  });

  it("totalmente transparente => []", () => {
    const img = makeImage([{ hex: "#33721d", ratio: 1, alpha: 0 }]);
    expect(extractPaletteFromPixels(img.data, img.width, img.height)).toEqual([]);
  });

  it("solo gris => un único color", () => {
    const img = makeImage([{ hex: "#808080", ratio: 1 }]);
    const pal = extractPaletteFromPixels(img.data, img.width, img.height);
    expect(pal).toHaveLength(1);
    expect(near(pal[0], "#808080")).toBe(true);
  });

  it("80% blanco y 20% #333333 => #333333, no blanco", () => {
    const img = makeImage([{ hex: "#ffffff", ratio: 0.8 }, { hex: "#333333", ratio: 0.2 }]);
    const pal = extractPaletteFromPixels(img.data, img.width, img.height);
    expect(pal).toHaveLength(1);
    expect(near(pal[0], "#333333")).toBe(true);
  });

  it("100% blanco => blanco", () => {
    const img = makeImage([{ hex: "#ffffff", ratio: 1 }]);
    const pal = extractPaletteFromPixels(img.data, img.width, img.height);
    expect(pal).toHaveLength(1);
    expect(near(pal[0], "#ffffff")).toBe(true);
  });
});

describe("suggestTenantColors", () => {
  it("verde y naranja", () => {
    expect(suggestTenantColors(["#33721d", "#f5a623"])).toEqual({
      primary: "#33721d",
      secondary: "#f5a623",
    });
  });

  it("un solo color => secundario análogo más claro", () => {
    const r = suggestTenantColors(["#33721d"]);
    expect(r.primary).toBe("#33721d");
    const p = hexToHsl("#33721d")!, s = hexToHsl(r.secondary!)!;
    expect(Math.abs(s.h - p.h)).toBeLessThanOrEqual(2);
    expect(s.l).toBeGreaterThanOrEqual(p.l + 18);
  });

  it("paleta vacía => nulos", () => {
    expect(suggestTenantColors([])).toEqual({ primary: null, secondary: null });
  });
});

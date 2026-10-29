import { hexToHsl, rgbToHex } from "@/utils/colorUtils";

interface Bucket {
  r: number;
  g: number;
  b: number;
  w: number;
}

function rgbToHslRaw(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/**
 * Extrae los colores protagonistas de un bitmap RGBA (p. ej. getImageData de un logo).
 * Ignora transparentes, casi blancos, casi negros y grises; si no queda nada,
 * devuelve el opaco no casi blanco más frecuente (o blanco si todo es casi blanco).
 */
export function extractPaletteFromPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxColors = 5,
): string[] {
  const total = Math.min(width * height, Math.floor(data.length / 4));
  const buckets = new Map<number, Bucket>();
  const raw = new Map<number, Bucket>();
  const rawNonWhite = new Map<number, Bucket>();

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const r = data[o], g = data[o + 1], b = data[o + 2], a = data[o + 3];
    if (a < 128) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const rb = raw.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
    rb.r += r; rb.g += g; rb.b += b; rb.w += 1;
    raw.set(key, rb);

    const { s, l } = rgbToHslRaw(r, g, b);
    if (l <= 94) {
      const nw = rawNonWhite.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
      nw.r += r; nw.g += g; nw.b += b; nw.w += 1;
      rawNonWhite.set(key, nw);
    }
    if (l > 94 || l < 8 || s < 15) continue;
    const w = 1 + 2 * (s / 100);
    const bk = buckets.get(key) ?? { r: 0, g: 0, b: 0, w: 0 };
    bk.r += r * w; bk.g += g * w; bk.b += b * w; bk.w += w;
    buckets.set(key, bk);
  }

  if (raw.size === 0) return [];

  if (buckets.size === 0) {
    let best: Bucket | null = null;
    const pool = rawNonWhite.size > 0 ? rawNonWhite : raw;
    for (const bk of pool.values()) if (!best || bk.w > best.w) best = bk;
    if (!best) return [];
    return [rgbToHex(best.r / best.w, best.g / best.w, best.b / best.w)];
  }

  // Fusión voraz por peso.
  const sorted = [...buckets.values()].sort((a, b) => b.w - a.w);
  const groups: Bucket[] = [];
  for (const bk of sorted) {
    const cr = bk.r / bk.w, cg = bk.g / bk.w, cb = bk.b / bk.w;
    const target = groups.find((gr) => {
      const dr = gr.r / gr.w - cr, dg = gr.g / gr.w - cg, db = gr.b / gr.w - cb;
      return Math.sqrt(dr * dr + dg * dg + db * db) < 40;
    });
    if (target) {
      target.r += bk.r; target.g += bk.g; target.b += bk.b; target.w += bk.w;
    } else {
      groups.push({ ...bk });
    }
  }
  groups.sort((a, b) => b.w - a.w);

  const chosen: { hex: string; h: number; l: number }[] = [];
  for (const gr of groups) {
    if (chosen.length >= maxColors) break;
    const r = gr.r / gr.w, g = gr.g / gr.w, b = gr.b / gr.w;
    const { h, l } = rgbToHslRaw(r, g, b);
    if (chosen.some((c) => hueDiff(c.h, h) < 20 && Math.abs(c.l - l) < 15)) continue;
    chosen.push({ hex: rgbToHex(r, g, b), h, l });
  }
  return chosen.map((c) => c.hex);
}

/** Sugiere primario y secundario a partir de una paleta ordenada por protagonismo. */
export function suggestTenantColors(palette: string[]): {
  primary: string | null;
  secondary: string | null;
} {
  if (palette.length === 0) return { primary: null, secondary: null };
  const primary =
    palette.find((c) => {
      const hsl = hexToHsl(c);
      return !!hsl && hsl.s >= 25 && hsl.l >= 15 && hsl.l <= 65;
    }) ?? palette[0];
  const p = hexToHsl(primary);
  if (!p) return { primary, secondary: null };
  const secondary = palette.find((c) => {
    if (c === primary) return false;
    const hsl = hexToHsl(c);
    return !!hsl && (hueDiff(hsl.h, p.h) >= 25 || Math.abs(hsl.l - p.l) >= 20);
  });
  if (secondary) return { primary, secondary };
  return { primary, secondary: hslToHex(p.h, p.s, Math.min(85, p.l + 20)) };
}

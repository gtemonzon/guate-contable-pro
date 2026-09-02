/**
 * Utilidades de color reutilizables (sin dependencias externas).
 */

export interface HSL {
  h: number;
  s: number;
  l: number;
}

/** Color primario por defecto del sistema (no se considera personalización). */
export const DEFAULT_TENANT_PRIMARY = "#1e40af";

/** Normaliza un hex (#abc, #aabbcc) a "#aabbcc" en minúsculas, o null si es inválido. */
export function normalizeHex(hex: string): string | null {
  const raw = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const [r, g, b] = raw.split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

/** Convierte un hex a componentes RGB (0-255), o null si el hex es inválido. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

/** Convierte componentes RGB (0-255) a hex "#rrggbb". */
export function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/** Convierte un hex a HSL con h en 0-360 y s/l en 0-100. Retorna null si el hex es inválido. */
export function hexToHsl(hex: string): HSL | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** Formatea un HSL como string CSS de tokens: "H S% L%". */
export function hslToCssTriplet(hsl: HSL): string {
  return `${hsl.h} ${hsl.s}% ${hsl.l}%`;
}

/**
 * Convierte un hex a la cadena "H S% L%" lista para usar en variables CSS.
 * Permite forzar una luminosidad concreta (útil para derivar fondos oscuros legibles).
 */
export function hexToCssHsl(hex: string, overrideLightness?: number): string | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const l = overrideLightness === undefined ? hsl.l : Math.max(0, Math.min(100, overrideLightness));
  return hslToCssTriplet({ ...hsl, l });
}

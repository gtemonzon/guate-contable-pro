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

/** Color secundario por defecto del sistema. */
export const DEFAULT_TENANT_SECONDARY = "#3b82f6";

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

/** Variables de paleta del tenant que puede fijar deriveTenantPaletteVars. */
export const TENANT_PALETTE_VARS = ["--tenant-h", "--tenant-s", "--tenant-2-h", "--tenant-2-s"] as const;

function paletteHS(hex: string | null | undefined, fallback: string): { h: string; s: string } | null {
  if (!hex) return null;
  const normalized = normalizeHex(hex);
  if (!normalized || normalized === normalizeHex(fallback)) return null;
  const hsl = hexToHsl(normalized);
  if (!hsl) return null;
  // Grises (< 10) se conservan; el resto se limita a 25–70 para fondos sobrios.
  const s = hsl.s < 10 ? hsl.s : Math.max(25, Math.min(70, hsl.s));
  return { h: String(hsl.h), s: `${s}%` };
}

/**
 * Variables CSS (matiz y saturación) de los colores personalizados del tenant.
 * Solo incluye colores válidos y distintos de su valor por defecto.
 */
export function deriveTenantPaletteVars(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const p = paletteHS(primary, DEFAULT_TENANT_PRIMARY);
  if (p) {
    out["--tenant-h"] = p.h;
    out["--tenant-s"] = p.s;
  }
  const s = paletteHS(secondary, DEFAULT_TENANT_SECONDARY);
  if (s) {
    out["--tenant-2-h"] = s.h;
    out["--tenant-2-s"] = s.s;
  }
  return out;
}

/** Luminancia relativa WCAG 2.x (0–1). Hex inválido => 0. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** Relación de contraste WCAG 2.x entre dos colores (1–21). */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const FG_WHITE = "0 0% 100%";
const FG_DARK = "0 0% 7%";
const FG_DARK_HEX = "#121212"; // hsl(0 0% 7%)

/** Tripleta HSL del texto legible sobre el color dado (blanco o casi negro). */
export function foregroundFor(hex: string): string {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, FG_DARK_HEX) ? FG_WHITE : FG_DARK;
}

function hslToHex({ h, s, l }: HSL): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

/** Variables del tema global que puede fijar deriveTenantThemeVars. */
export const TENANT_THEME_VARS = [
  "--tenant-primary",
  "--tenant-primary-fg",
  "--tenant-primary-hover",
  "--tenant-primary-dark",
  "--tenant-primary-fg-dark",
  "--tenant-accent",
  "--tenant-accent-fg",
  "--tenant-accent-dark",
  "--tenant-accent-fg-dark",
] as const;

function customHsl(hex: string | null | undefined, fallback: string): { hex: string; hsl: HSL } | null {
  if (!hex) return null;
  const normalized = normalizeHex(hex);
  if (!normalized || normalized === normalizeHex(fallback)) return null;
  const hsl = hexToHsl(normalized);
  return hsl ? { hex: normalized, hsl } : null;
}

/**
 * Variables del tema global (primario y acento) derivadas de los colores del tenant.
 * Solo incluye colores válidos y distintos de su valor por defecto.
 */
export function deriveTenantThemeVars(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  const p = customHsl(primary, DEFAULT_TENANT_PRIMARY);
  const s = customHsl(secondary, DEFAULT_TENANT_SECONDARY);
  if (p) {
    const { hsl } = p;
    out["--tenant-primary"] = hslToCssTriplet(hsl);
    out["--tenant-primary-fg"] = foregroundFor(p.hex);
    out["--tenant-primary-hover"] = hslToCssTriplet({ ...hsl, l: hsl.l < 20 ? hsl.l + 8 : hsl.l - 8 });
    const dark: HSL = { h: hsl.h, s: Math.min(85, hsl.s), l: Math.max(62, Math.min(78, hsl.l)) };
    out["--tenant-primary-dark"] = hslToCssTriplet(dark);
    out["--tenant-primary-fg-dark"] = foregroundFor(hslToHex(dark));
  }
  const base = s ?? p;
  if (base) {
    const { h, s: sat } = base.hsl;
    const sc = sat < 10 ? sat : Math.max(25, Math.min(70, sat));
    out["--tenant-accent"] = `${h} ${sc}% 94%`;
    out["--tenant-accent-fg"] = `${h} ${sc}% 28%`;
    out["--tenant-accent-dark"] = `${h} ${sc}% 20%`;
    out["--tenant-accent-fg-dark"] = `${h} ${sc}% 82%`;
  }
  return out;
}

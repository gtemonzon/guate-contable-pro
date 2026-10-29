export const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function validateLogoFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) return "Formato no permitido. Usa PNG, JPG, WEBP o SVG.";
  if (file.size > MAX_LOGO_BYTES) return "El archivo es muy grande (máximo 2 MB).";
  return null;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function logoExtension(type: string): string {
  const ext = EXT[type];
  if (!ext) throw new Error("Formato no permitido. Usa PNG, JPG, WEBP o SVG.");
  return ext;
}

export function buildLogoPath(tenantCode: string, file: { type: string }, now: number = Date.now()): string {
  return `logos/${tenantCode.toLowerCase()}-${now}.${logoExtension(file.type)}`;
}

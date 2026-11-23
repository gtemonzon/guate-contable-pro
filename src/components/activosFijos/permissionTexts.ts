/** Textos de permiso insuficiente en activos fijos (aviso y title de botones). */
export const PERMISSION_TEXTS = {
  valuation: "Solo administradores y contadores senior pueden hacer esto.",
  write: "Tu rol no permite modificar activos fijos.",
} as const;

export type PermissionKind = keyof typeof PERMISSION_TEXTS;

/**
 * Mensajes de error legibles para el módulo de activos fijos.
 *
 * La base de datos restringe el módulo por rol (RLS y disparadores); sus rechazos
 * llegan como códigos o textos técnicos. Esta función los traduce para el usuario.
 */

const PERMISSION_MESSAGE =
  "No tienes permiso para realizar esta acción en esta empresa. Pide ayuda a un administrador o contador senior.";
const WRONG_ENTERPRISE_MESSAGE = "Los datos no corresponden a esta empresa. Recarga la página e inténtalo de nuevo.";
const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado";

/** Mensajes que la base de datos ya devuelve en español: se muestran tal cual. */
const SPANISH_DB_PREFIXES = ["Solo puede crear", "La baja o venta", "Modificar la valoración"];

function readField(error: unknown, field: "code" | "message"): string | null {
  if (typeof error !== "object" || error === null || !(field in error)) return null;
  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

export function friendlyFixedAssetError(error: unknown): string {
  const code = readField(error, "code");
  const message = readField(error, "message");

  // (a) Permiso denegado por la base de datos.
  if (code === "42501" || (message && /row-level security/i.test(message))) return PERMISSION_MESSAGE;

  // (b) Datos de otra empresa (restricción de verificación).
  if (code === "23514" || (message && message.includes("no pertenece a la empresa"))) return WRONG_ENTERPRISE_MESSAGE;

  // (c) Mensajes de la base de datos ya escritos en español.
  if (message && SPANISH_DB_PREFIXES.some((prefix) => message.startsWith(prefix))) return message;

  // (d) Cualquier otro error con mensaje (Error, PostgrestError u objeto similar).
  if (message) return message;

  // (e) Otra cosa.
  return UNEXPECTED_MESSAGE;
}

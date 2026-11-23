/**
 * Mensajes de error de activos fijos.
 * Run with: bunx vitest run src/utils/fixedAssetErrors.test.ts
 */
import { describe, it, expect } from "vitest";
import { friendlyFixedAssetError } from "./fixedAssetErrors";

const PERMISSION =
  "No tienes permiso para realizar esta acción en esta empresa. Pide ayuda a un administrador o contador senior.";
const WRONG_ENTERPRISE = "Los datos no corresponden a esta empresa. Recarga la página e inténtalo de nuevo.";

describe("friendlyFixedAssetError", () => {
  it("(a) permiso: código 42501 o mensaje de row-level security", () => {
    expect(friendlyFixedAssetError({ code: "42501", message: "permission denied for table fixed_assets" })).toBe(PERMISSION);
    expect(friendlyFixedAssetError({ message: 'new row violates row-level security policy for table "fixed_assets"' })).toBe(PERMISSION);
    expect(friendlyFixedAssetError(new Error("new row violates row-level security policy"))).toBe(PERMISSION);
  });

  it("(b) otra empresa: código 23514 o 'no pertenece a la empresa'", () => {
    expect(friendlyFixedAssetError({ code: "23514", message: "violates check constraint" })).toBe(WRONG_ENTERPRISE);
    expect(friendlyFixedAssetError({ message: "La ubicación no pertenece a la empresa del activo" })).toBe(WRONG_ENTERPRISE);
  });

  it("(c) mensajes en español de la base de datos se devuelven tal cual", () => {
    for (const msg of [
      "Solo puede crear activos en borrador",
      "La baja o venta requiere permiso de valoración",
      "Modificar la valoración de un activo activado requiere permiso",
    ]) {
      expect(friendlyFixedAssetError({ code: "P0001", message: msg })).toBe(msg);
    }
  });

  it("(d) otro Error u objeto tipo PostgrestError: su message", () => {
    expect(friendlyFixedAssetError(new Error("Usuario no autenticado"))).toBe("Usuario no autenticado");
    expect(friendlyFixedAssetError({ code: "23505", message: "duplicate key value", details: null, hint: null }))
      .toBe("duplicate key value");
  });

  it("(e) cualquier otra cosa: mensaje genérico", () => {
    expect(friendlyFixedAssetError("texto suelto")).toBe("Ocurrió un error inesperado");
    expect(friendlyFixedAssetError(null)).toBe("Ocurrió un error inesperado");
    expect(friendlyFixedAssetError(undefined)).toBe("Ocurrió un error inesperado");
    expect(friendlyFixedAssetError({ code: 42 })).toBe("Ocurrió un error inesperado");
    expect(friendlyFixedAssetError({ message: "" })).toBe("Ocurrió un error inesperado");
  });
});

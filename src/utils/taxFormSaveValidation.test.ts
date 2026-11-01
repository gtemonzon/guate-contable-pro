import { describe, it, expect } from "vitest";
import { taxFormDuplicateMessage, staleInactiveTaxForm } from "./taxFormSaveValidation";

describe("taxFormDuplicateMessage", () => {
  it("permite reutilizar el número de un formulario eliminado", () => {
    expect(taxFormDuplicateMessage({ id: 181, is_active: false })).toBeNull();
  });

  it("bloquea el número de otro formulario activo", () => {
    expect(taxFormDuplicateMessage({ id: 181, is_active: true }, 182)).not.toBeNull();
  });

  it("permite editar el propio formulario sin cambiar su número", () => {
    expect(taxFormDuplicateMessage({ id: 181, is_active: true }, 181)).toBeNull();
  });

  it("permite un número que no existe", () => {
    expect(taxFormDuplicateMessage(null)).toBeNull();
  });
});

describe("staleInactiveTaxForm", () => {
  it("devuelve el formulario inactivo que debe purgarse", () => {
    expect(staleInactiveTaxForm({ id: 181, is_active: false })?.id).toBe(181);
  });

  it("no purga formularios activos", () => {
    expect(staleInactiveTaxForm({ id: 181, is_active: true })).toBeNull();
  });
});

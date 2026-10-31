import { describe, it, expect } from "vitest";
import { taxFormDuplicateMessage } from "./taxFormSaveValidation";

describe("taxFormDuplicateMessage", () => {
  it("bloquea el número reservado por un formulario eliminado", () => {
    expect(taxFormDuplicateMessage({ id: 181, is_active: false })).not.toBeNull();
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
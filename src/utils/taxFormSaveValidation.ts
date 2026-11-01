interface ExistingTaxForm {
  id: number;
  is_active: boolean;
}

/** Los números siguen reservados aunque el formulario se haya eliminado. */
export function taxFormDuplicateMessage(
  existing: ExistingTaxForm | null,
  editingId?: number,
): string | null {
  if (!existing || existing.id === editingId) return null;
  return existing.is_active
    ? "Ya existe un formulario con ese número"
    : "Este número pertenece a un formulario eliminado. No se puede registrar de nuevo mientras ese número siga reservado. No se guardaron cambios.";
}
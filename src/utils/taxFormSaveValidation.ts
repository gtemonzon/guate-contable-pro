interface ExistingTaxForm {
  id: number;
  is_active: boolean;
  file_path?: string | null;
}

/** Solo un formulario activo bloquea el número; los inactivos (legado) se purgan. */
export function taxFormDuplicateMessage(
  existing: ExistingTaxForm | null,
  editingId?: number,
): string | null {
  if (!existing || existing.id === editingId || !existing.is_active) return null;
  return "Ya existe un formulario con ese número";
}

/** Formulario inactivo heredado del borrado anterior que debe eliminarse para liberar el número. */
export function staleInactiveTaxForm(
  existing: ExistingTaxForm | null,
  editingId?: number,
): ExistingTaxForm | null {
  if (!existing || existing.id === editingId || existing.is_active) return null;
  return existing;
}

const STATUS_LABELS: Record<string, string> = {
  borrador: "en borrador",
  pendiente_revision: "pendiente de revisión",
  aprobado: "aprobada pero no contabilizada",
  rechazado: "rechazada",
};

/**
 * Aviso para el mayor (o el libro de bancos) abierto desde una partida que no está
 * contabilizada.
 */
export function ledgerEntryNotice(
  status: string | null | undefined,
  book: "mayor" | "bancos" = "mayor",
): string | null {
  if (!status || status === "contabilizado") return null;
  const label = STATUS_LABELS[status] ?? "no contabilizada";
  if (book === "bancos") {
    return `Esta partida está ${label}: el libro de bancos solo suma partidas contabilizadas, por eso sus montos no aparecen aquí.`;
  }
  return `Esta partida está ${label}: el mayor solo incluye partidas contabilizadas, por eso sus líneas no aparecen aquí.`;
}

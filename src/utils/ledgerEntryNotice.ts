const STATUS_LABELS: Record<string, string> = {
  borrador: "en borrador",
  pendiente_revision: "pendiente de revisión",
  aprobado: "aprobada pero no contabilizada",
  rechazado: "rechazada",
};

/** Aviso para el mayor abierto desde una partida que no está contabilizada. */
export function ledgerEntryNotice(status: string | null | undefined): string | null {
  if (!status || status === "contabilizado") return null;
  const label = STATUS_LABELS[status] ?? "no contabilizada";
  return `Esta partida está ${label}: el mayor solo incluye partidas contabilizadas, por eso sus líneas no aparecen aquí.`;
}

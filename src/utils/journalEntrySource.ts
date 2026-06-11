/**
 * Detect a journal entry's source from its entry_number prefix.
 * Used to determine eligibility for "Reopen for Editing" and to route
 * the "Go to Source Document" action.
 */
export type EntrySource =
  | "MANUAL"
  | "ADJUSTMENT"
  | "PURCHASES"
  | "SALES"
  | "OPENING"
  | "CLOSING"
  | "DEPRECIATION"
  | "FX_REVALUATION"
  | "COST_OF_SALES"
  | "TRANSFER"
  | "REVERSAL"
  | "OTHER";

export function detectEntrySource(entryNumber: string | null | undefined): EntrySource {
  if (!entryNumber) return "OTHER";
  const prefix = entryNumber.split("-")[0]?.toUpperCase() ?? "";
  switch (prefix) {
    case "PART":
      return "MANUAL";
    case "AJUS":
      return "ADJUSTMENT";
    case "COMP":
      return "PURCHASES";
    case "VENT":
      return "SALES";
    case "APER":
      return "OPENING";
    case "CIER":
      return "CLOSING";
    case "DEP":
    case "DEPR":
      return "DEPRECIATION";
    case "DIFC":
      return "FX_REVALUATION";
    case "COGS":
    case "CSTV":
      return "COST_OF_SALES";
    case "TRAS":
      return "TRANSFER";
    case "REV":
      return "REVERSAL";
    default:
      return "OTHER";
  }
}

export function isManualEntry(entryNumber: string | null | undefined): boolean {
  const s = detectEntrySource(entryNumber);
  return s === "MANUAL" || s === "ADJUSTMENT";
}

export function sourceDocumentRoute(source: EntrySource): string | null {
  switch (source) {
    case "PURCHASES":
      return "/compras";
    case "SALES":
      return "/ventas";
    case "DEPRECIATION":
      return "/activos-fijos";
    case "FX_REVALUATION":
      return "/partidas";
    default:
      return null;
  }
}

export function sourceLabel(source: EntrySource): string {
  switch (source) {
    case "MANUAL": return "Manual";
    case "ADJUSTMENT": return "Ajuste Manual";
    case "PURCHASES": return "Compras";
    case "SALES": return "Ventas";
    case "OPENING": return "Apertura";
    case "CLOSING": return "Cierre";
    case "DEPRECIATION": return "Depreciación";
    case "FX_REVALUATION": return "Revaluación Cambiaria";
    case "COST_OF_SALES": return "Costo de Ventas";
    case "TRANSFER": return "Traslado de Saldos";
    case "REVERSAL": return "Reversión";
    default: return "Otro";
  }
}

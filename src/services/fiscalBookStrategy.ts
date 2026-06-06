/**
 * Fiscal Book Strategy
 * ---------------------
 * Strategy pattern that maps the company's VAT tax regime to the
 * behaviour and presentation rules used by the SAT books and reports.
 *
 * To support a new regime in the future:
 *  1. Add it to `TaxRegime`.
 *  2. Add an entry to `REGIME_REGISTRY` describing how books behave.
 *  3. Existing report/UI code automatically adapts via `getFiscalBookStrategy()`.
 */

export type TaxRegime =
  | "contribuyente_general"
  | "profesional_liberal"
  | "pequeño_contribuyente"
  | "exenta_ong"
  | (string & {});

export interface FiscalBookStrategy {
  /** Internal regime code as stored in tab_enterprises.tax_regime */
  regime: TaxRegime;
  /** Human friendly label (Spanish) used in headers, badges, etc. */
  label: string;
  /** Short label used in compact UI spots (badges, tabs). */
  shortLabel: string;
  /** When true, purchases and sales must be presented as a single combined book. */
  combinedBook: boolean;
  /** Optional regulatory note injected into report headers. */
  headerNote?: string;
  /** Whether the company applies VAT on its operations. */
  appliesVat: boolean;
}

const REGIME_REGISTRY: Record<string, FiscalBookStrategy> = {
  contribuyente_general: {
    regime: "contribuyente_general",
    label: "Contribuyente General de IVA",
    shortLabel: "Régimen General",
    combinedBook: false,
    appliesVat: true,
  },
  profesional_liberal: {
    regime: "profesional_liberal",
    label: "Contribuyente Servicios Profesionales",
    shortLabel: "Profesional Liberal",
    combinedBook: false,
    appliesVat: true,
  },
  pequeño_contribuyente: {
    regime: "pequeño_contribuyente",
    label: "Pequeño Contribuyente",
    shortLabel: "Pequeño Contribuyente",
    combinedBook: true,
    headerNote:
      "Régimen de Pequeño Contribuyente — Libro de Compras y Ventas (formato SAT)",
    appliesVat: true,
  },
  exenta_ong: {
    regime: "exenta_ong",
    label: "Contribuyente Exento de IVA",
    shortLabel: "Exento de IVA",
    combinedBook: false,
    headerNote: "Contribuyente Exento de IVA",
    appliesVat: false,
  },
};

const DEFAULT_STRATEGY: FiscalBookStrategy = REGIME_REGISTRY.contribuyente_general;

export function getFiscalBookStrategy(regime: string | null | undefined): FiscalBookStrategy {
  if (!regime) return DEFAULT_STRATEGY;
  return REGIME_REGISTRY[regime] ?? {
    ...DEFAULT_STRATEGY,
    regime,
    label: regime,
    shortLabel: regime,
  };
}

export function listFiscalBookStrategies(): FiscalBookStrategy[] {
  return Object.values(REGIME_REGISTRY);
}

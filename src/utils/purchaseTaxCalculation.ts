/**
 * Mixed-tax purchase calculation engine (Phase 1).
 *
 * Guatemalan invoices may mix three components in a single total:
 *   1. A taxable portion that generates VAT credit
 *   2. A non-VAT portion (tourism tax, fiscal stamps, electricity tax, other)
 *   3. IDP — fuel distribution tax (kept in its own field for backward compatibility
 *      with existing SAT import logic and the fuel operation flow)
 *
 * Formula:
 *   TaxableWithVAT = Total - ExemptAmount - IdpAmount
 *   TaxableBase    = TaxableWithVAT / (1 + VATRate)
 *   VATCredit      = TaxableWithVAT - TaxableBase
 *
 * Document types in NO_VAT_DOCUMENT_TYPES never generate VAT credit; their full
 * (total - exempt - idp) becomes base, vat = 0.
 */

export const NO_VAT_DOCUMENT_TYPES = ["FPEQ", "FESP", "NABN", "RDON", "RECI"] as const;

export const TAX_CATEGORIES = [
  { code: "TOURISM_TAX", label: "Impuesto al Turismo (INGUAT)" },
  { code: "IDP", label: "IDP — Distribución de Petróleo" },
  { code: "ELECTRICITY_TAX", label: "Impuestos sobre Electricidad" },
  { code: "FISCAL_STAMP", label: "Timbres Fiscales" },
  { code: "OTHER", label: "Otros impuestos no acreditables" },
] as const;

export type TaxCategoryCode = (typeof TAX_CATEGORIES)[number]["code"];

export interface MixedTaxInput {
  totalAmount: number;
  exemptAmount?: number;
  idpAmount?: number;
  documentType?: string;
  vatRate?: number; // default 0.12
}

export interface MixedTaxResult {
  /** Final invoice total (unchanged) */
  total: number;
  /** Non-VAT portion (tourism tax, fiscal stamps, electricity tax, other) */
  exempt: number;
  /** IDP portion (fuel) */
  idp: number;
  /** Portion of total still subject to VAT (Total − Exempt − IDP) */
  taxableWithVat: number;
  /** Net base before VAT */
  base: number;
  /** VAT credit amount */
  vat: number;
}

/**
 * Round to 2 decimals using bankers rounding-friendly half-up.
 */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateMixedTax(input: MixedTaxInput): MixedTaxResult {
  const total = Number(input.totalAmount) || 0;
  const exempt = Math.max(0, Number(input.exemptAmount) || 0);
  const idp = Math.max(0, Number(input.idpAmount) || 0);
  const vatRate = input.vatRate ?? 0.12;
  const docType = (input.documentType || "FACT").toUpperCase().trim();

  // Cap non-VAT portions to total to avoid negative bases
  const nonVatPortion = Math.min(exempt + idp, total);
  const taxableWithVat = round2(total - nonVatPortion);

  if ((NO_VAT_DOCUMENT_TYPES as readonly string[]).includes(docType)) {
    return {
      total: round2(total),
      exempt: round2(exempt),
      idp: round2(idp),
      taxableWithVat,
      base: taxableWithVat,
      vat: 0,
    };
  }

  const base = round2(taxableWithVat / (1 + vatRate));
  const vat = round2(taxableWithVat - base);

  return {
    total: round2(total),
    exempt: round2(exempt),
    idp: round2(idp),
    taxableWithVat,
    base,
    vat,
  };
}

export function getTaxCategoryLabel(code: string | null | undefined): string {
  if (!code) return "—";
  return TAX_CATEGORIES.find((c) => c.code === code)?.label ?? code;
}

/**
 * Recompute base_amount / vat_amount / exempt_amount / idp_amount on a purchase-like row.
 * Returns a NEW object with the canonical engine result merged in.
 * Use this on load AND right before persistence so the UI and DB always agree
 * with the mixed-tax engine.
 */
export function applyMixedTaxToRow<T extends {
  total_amount?: number | string | null;
  exempt_amount?: number | string | null;
  idp_amount?: number | string | null;
  fel_document_type?: string | null;
  base_amount?: number | string | null;
  vat_amount?: number | string | null;
}>(row: T): T {
  const total = Number(row.total_amount) || 0;
  const exempt = Number(row.exempt_amount) || 0;
  const idp = Number(row.idp_amount) || 0;
  const r = calculateMixedTax({
    totalAmount: total,
    exemptAmount: exempt,
    idpAmount: idp,
    documentType: row.fel_document_type ?? undefined,
  });
  return {
    ...row,
    total_amount: r.total,
    exempt_amount: r.exempt,
    idp_amount: r.idp,
    base_amount: r.base,
    vat_amount: r.vat,
  };
}

/** True when stored base/vat differ from the engine result by more than 1 cent. */
export function rowNeedsRecalc(row: {
  total_amount?: number | string | null;
  exempt_amount?: number | string | null;
  idp_amount?: number | string | null;
  fel_document_type?: string | null;
  base_amount?: number | string | null;
  vat_amount?: number | string | null;
}): boolean {
  const r = calculateMixedTax({
    totalAmount: Number(row.total_amount) || 0,
    exemptAmount: Number(row.exempt_amount) || 0,
    idpAmount: Number(row.idp_amount) || 0,
    documentType: row.fel_document_type ?? undefined,
  });
  const dBase = Math.abs((Number(row.base_amount) || 0) - r.base);
  const dVat = Math.abs((Number(row.vat_amount) || 0) - r.vat);
  return dBase > 0.005 || dVat > 0.005;
}

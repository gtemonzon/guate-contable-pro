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

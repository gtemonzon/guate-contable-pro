/**
 * Mixed-tax purchase calculation engine (unified "No afecto" model).
 *
 * After Batch 2 (2026-06), IDP is no longer a separate field. It lives inside
 * `exempt_amount` with `tax_category = 'IDP'`. The engine accepts a single
 * `exemptAmount` parameter representing the Non-VAT portion of the total.
 *
 * Formula:
 *   TaxableWithVAT = Total - ExemptAmount
 *   TaxableBase    = TaxableWithVAT / (1 + VATRate)
 *   VATCredit      = TaxableWithVAT - TaxableBase
 *
 * Document types in NO_VAT_DOCUMENT_TYPES never generate VAT credit; their full
 * (total - exempt) becomes base, vat = 0.
 *
 * The `idpAmount` input is kept for backward compatibility ONLY: callers that
 * still pass it will have it folded into `exemptAmount` internally. The output
 * `idp` field is deprecated and always 0.
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
  /** Non-VAT portion (No afecto): tourism tax, IDP, electricity, fiscal stamps, other. */
  exemptAmount?: number;
  /** @deprecated Pass via exemptAmount with tax_category='IDP'. Folded into exemptAmount when provided. */
  idpAmount?: number;
  documentType?: string;
  vatRate?: number; // default 0.12
  /**
   * When false (VAT-exempt enterprise, e.g. Exenta ONG), the engine skips VAT
   * entirely: base = total, vat = 0, exempt input ignored.
   */
  appliesVat?: boolean;
}

export interface MixedTaxResult {
  total: number;
  /** Non-VAT portion (unified No afecto). */
  exempt: number;
  /** @deprecated Always 0. Kept in shape for callers still destructuring it. */
  idp: number;
  /** Portion of total still subject to VAT (Total − ExemptAmount) */
  taxableWithVat: number;
  /** Net base before VAT */
  base: number;
  /** VAT credit amount */
  vat: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function calculateMixedTax(input: MixedTaxInput): MixedTaxResult {
  const total = Number(input.totalAmount) || 0;
  // Back-compat: if a legacy caller passes idpAmount, fold it into exemptAmount.
  const exempt = Math.max(
    0,
    (Number(input.exemptAmount) || 0) + (Number(input.idpAmount) || 0)
  );
  const vatRate = input.vatRate ?? 0.12;
  const docType = (input.documentType || "FACT").toUpperCase().trim();
  const appliesVat = input.appliesVat !== false;

  if (!appliesVat) {
    return {
      total: round2(total),
      exempt: 0,
      idp: 0,
      taxableWithVat: round2(total),
      base: round2(total),
      vat: 0,
    };
  }

  const nonVatPortion = Math.min(exempt, total);
  const taxableWithVat = round2(total - nonVatPortion);

  if ((NO_VAT_DOCUMENT_TYPES as readonly string[]).includes(docType)) {
    return {
      total: round2(total),
      exempt: round2(exempt),
      idp: 0,
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
    idp: 0,
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
 * Recompute base_amount / vat_amount / exempt_amount on a purchase-like row.
 * The legacy `idp_amount` column is no longer written by this function; callers
 * must persist via `exempt_amount` + `tax_category`.
 */
export function applyMixedTaxToRow<T extends {
  total_amount?: number | string | null;
  exempt_amount?: number | string | null;
  /** @deprecated read-only legacy column. */
  idp_amount?: number | string | null;
  fel_document_type?: string | null;
  base_amount?: number | string | null;
  vat_amount?: number | string | null;
}>(row: T, opts?: { appliesVat?: boolean }): T {
  const total = Number(row.total_amount) || 0;
  const exempt = Number(row.exempt_amount) || 0;
  const r = calculateMixedTax({
    totalAmount: total,
    exemptAmount: exempt,
    documentType: row.fel_document_type ?? undefined,
    appliesVat: opts?.appliesVat,
  });
  return {
    ...row,
    total_amount: r.total,
    exempt_amount: r.exempt,
    base_amount: r.base,
    vat_amount: r.vat,
  };
}

export function rowNeedsRecalc(row: {
  total_amount?: number | string | null;
  exempt_amount?: number | string | null;
  fel_document_type?: string | null;
  base_amount?: number | string | null;
  vat_amount?: number | string | null;
}): boolean {
  const r = calculateMixedTax({
    totalAmount: Number(row.total_amount) || 0,
    exemptAmount: Number(row.exempt_amount) || 0,
    documentType: row.fel_document_type ?? undefined,
  });
  const dBase = Math.abs((Number(row.base_amount) || 0) - r.base);
  const dVat = Math.abs((Number(row.vat_amount) || 0) - r.vat);
  return dBase > 0.005 || dVat > 0.005;
}

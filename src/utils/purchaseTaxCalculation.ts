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

/**
 * Exención temporal aplicable a una compra (p. ej. Decreto 22-2026, combustibles).
 * Se resuelve con `resolveExemption` (src/utils/taxExemption.ts) por tipo de
 * operación + fecha de factura, o a partir del sello guardado en la fila.
 */
export interface PurchaseTaxExemption {
  /** Tasa de IVA de la regla (0 para exención total). Se guarda en vat_rate_applied. */
  vatRate: number;
  /** Si la regla también exonera el IDP: una porción No afecta con tax_category='IDP' pasa a 0. */
  blocksIdp: boolean;
  /** Código de la regla. Se guarda en exemption_rule_code. */
  code: string;
}

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
  /** Clasificación de la porción No afecta (necesaria para saber si es IDP). */
  taxCategory?: string | null;
  /**
   * Exención vigente para la compra. Si viene: vat = 0 y base = total − exempt
   * (exempt = 0 si blocksIdp y la porción No afecta es IDP). Sin exemption el
   * cálculo es exactamente el de siempre.
   */
  exemption?: PurchaseTaxExemption | null;
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
  /** Clasificación resultante de la porción No afecta (null si la exención eliminó el IDP). */
  taxCategory?: string | null;
  /** Código de la exención aplicada (solo cuando vino `exemption`). */
  exemptionCode?: string | null;
  /** Tasa de IVA aplicada por la exención (solo cuando vino `exemption`). */
  vatRateApplied?: number | null;
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

  if (input.exemption) {
    // Exención vigente: sin IVA; base = total − No afecto. Si la regla también
    // exonera el IDP, la porción IDP (tax_category='IDP' o el legado idpAmount) es 0.
    const category = input.taxCategory ?? null;
    const isIdp = (category || "").toUpperCase() === "IDP";
    const clearIdp = input.exemption.blocksIdp && isIdp;
    const keptExempt = input.exemption.blocksIdp
      ? (clearIdp ? 0 : Math.max(0, Number(input.exemptAmount) || 0))
      : exempt;
    const nonVat = Math.min(keptExempt, total);
    const base = round2(total - nonVat);
    return {
      total: round2(total),
      exempt: round2(keptExempt),
      idp: 0,
      taxableWithVat: base,
      base,
      vat: 0,
      taxCategory: clearIdp ? null : category,
      exemptionCode: input.exemption.code,
      vatRateApplied: input.exemption.vatRate,
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
 *
 * Cuando el llamador pasa `exemption` (aunque sea null), también se escriben los
 * sellos `vat_rate_applied` / `exemption_rule_code` (null si no hay exención) y
 * `tax_category` queda en null si la exención eliminó el IDP.
 */
export function applyMixedTaxToRow<T extends {
  total_amount?: number | string | null;
  exempt_amount?: number | string | null;
  /** @deprecated read-only legacy column. */
  idp_amount?: number | string | null;
  fel_document_type?: string | null;
  base_amount?: number | string | null;
  vat_amount?: number | string | null;
  tax_category?: string | null;
}>(row: T, opts?: { appliesVat?: boolean; exemption?: PurchaseTaxExemption | null }): T {
  const total = Number(row.total_amount) || 0;
  const exempt = Number(row.exempt_amount) || 0;
  const r = calculateMixedTax({
    totalAmount: total,
    exemptAmount: exempt,
    documentType: row.fel_document_type ?? undefined,
    appliesVat: opts?.appliesVat,
    taxCategory: row.tax_category ?? null,
    exemption: opts?.exemption ?? null,
  });
  const next = {
    ...row,
    total_amount: r.total,
    exempt_amount: r.exempt,
    base_amount: r.base,
    vat_amount: r.vat,
  };
  if (opts && "exemption" in opts) {
    const stamped = next as T & { vat_rate_applied?: number | null; exemption_rule_code?: string | null };
    stamped.vat_rate_applied = r.exemptionCode ? (r.vatRateApplied ?? 0) : null;
    stamped.exemption_rule_code = r.exemptionCode ?? null;
    if (r.exemptionCode && r.taxCategory === null && row.tax_category) {
      stamped.tax_category = null;
    }
    return stamped;
  }
  return next;
}

/** Exención a partir del sello guardado en la fila (exemption_rule_code). */
export function exemptionFromStamp(row: {
  exemption_rule_code?: string | null;
  vat_rate_applied?: number | string | null;
}): PurchaseTaxExemption | null {
  if (!row.exemption_rule_code) return null;
  // La base ya aplicó el bloqueo de IDP al sellar; no se vuelve a tocar el No afecto.
  return { code: row.exemption_rule_code, vatRate: Number(row.vat_rate_applied) || 0, blocksIdp: false };
}

/**
 * ¿La fila tiene base/IVA distintos de lo que da el motor?
 *
 * Nunca devuelve true para una fila exonerada: ni si trae el sello
 * (exemption_rule_code), ni si su forma ya es la de una exonerada (IVA 0 y
 * base = total − No afecto) sin que el llamador haya resuelto una exención. Así
 * ningún recálculo masivo la devuelve al 12%.
 *
 * `opts.exemption`: undefined = usar el sello de la fila; null = se resolvió que no
 * hay exención (la fila sí se compara contra el cálculo normal, salvo la forma exonerada).
 */
export function rowNeedsRecalc(
  row: {
    total_amount?: number | string | null;
    exempt_amount?: number | string | null;
    fel_document_type?: string | null;
    base_amount?: number | string | null;
    vat_amount?: number | string | null;
    tax_category?: string | null;
    exemption_rule_code?: string | null;
    vat_rate_applied?: number | string | null;
  },
  opts?: { appliesVat?: boolean; exemption?: PurchaseTaxExemption | null },
): boolean {
  const exemption = opts && opts.exemption !== undefined ? opts.exemption : exemptionFromStamp(row);
  const total = Number(row.total_amount) || 0;
  const exempt = Number(row.exempt_amount) || 0;
  const storedBase = Number(row.base_amount) || 0;
  const storedVat = Number(row.vat_amount) || 0;

  if (!exemption) {
    const exoneradaShape = Math.abs(storedVat) <= 0.005 && Math.abs(storedBase - (total - exempt)) <= 0.005;
    if (exoneradaShape) return false;
  }

  const r = calculateMixedTax({
    totalAmount: total,
    exemptAmount: exempt,
    documentType: row.fel_document_type ?? undefined,
    appliesVat: opts?.appliesVat,
    taxCategory: row.tax_category ?? null,
    exemption,
  });
  const dBase = Math.abs(storedBase - r.base);
  const dVat = Math.abs(storedVat - r.vat);
  const dExempt = exemption ? Math.abs(exempt - r.exempt) : 0;
  return dBase > 0.005 || dVat > 0.005 || dExempt > 0.005;
}

/**
 * Centralized Purchase Accounting Engine.
 *
 * Single source of truth for ALL purchase value calculations across the app:
 * Purchase Book, Reports, Statistics, Tax Declarations, Journal Generation,
 * Bank-linked purchases, Dashboard widgets, APIs.
 *
 * This module ONLY computes accounting values. It does NOT create journal
 * lines or debit/credit entries — that responsibility belongs to
 * `purchaseJournalLinesBuilder.ts`, which consumes the result of this engine
 * plus the enterprise's account mapping.
 *
 * Inputs/outputs intentionally avoid the legacy `idp_amount` field.
 */

import {
  calculateMixedTax,
  applyMixedTaxToRow,
  rowNeedsRecalc,
  TAX_CATEGORIES,
  NO_VAT_DOCUMENT_TYPES,
  getTaxCategoryLabel,
  type TaxCategoryCode,
  type MixedTaxInput,
  type MixedTaxResult,
} from "./purchaseTaxCalculation";

export { TAX_CATEGORIES, NO_VAT_DOCUMENT_TYPES, getTaxCategoryLabel };
export type { TaxCategoryCode };

export interface PurchaseAccountingInput {
  /** Final invoice total (currency-agnostic). */
  totalAmount: number;
  /** Non-VAT portion (No afecto): tourism tax, IDP, electricity, fiscal stamps, other. */
  nonVatAmount?: number;
  /** Optional classification of the Non-VAT portion. */
  taxCategory?: TaxCategoryCode | string | null;
  /** FEL document type code; controls VAT applicability for special types. */
  documentType?: string;
  /** Default 0.12 (Guatemala). */
  vatRate?: number;
  /** False when the enterprise is fully VAT-exempt (ONG / Exenta). */
  appliesVat?: boolean;
}

export interface PurchaseAccountingResult {
  /** Final total (echoed, rounded). */
  total: number;
  /** Non-VAT portion (No afecto), rounded. */
  nonVat: number;
  /** Category that classifies the Non-VAT portion (echoed; null if none). */
  taxCategory: string | null;
  /** Portion of total subject to VAT (total − nonVat). */
  taxable: number;
  /** Net base before VAT. */
  base: number;
  /** Recoverable VAT credit. */
  vat: number;
  /** Total to be posted to the expense account in the simplest mapping case. */
  expense: number;
  /** Whether VAT was applied (false for VAT-exempt enterprises / no-VAT doc types). */
  appliesVat: boolean;
}

/**
 * Pure value calculator. Same numbers used by reports, dashboard, declarations
 * and journal generation. No DB calls, no account mapping, no posting logic.
 */
export function calculatePurchaseAccounting(
  input: PurchaseAccountingInput
): PurchaseAccountingResult {
  const mt: MixedTaxInput = {
    totalAmount: input.totalAmount,
    exemptAmount: input.nonVatAmount ?? 0,
    documentType: input.documentType,
    vatRate: input.vatRate,
    appliesVat: input.appliesVat,
  };
  const r: MixedTaxResult = calculateMixedTax(mt);
  return {
    total: r.total,
    nonVat: r.exempt,
    taxCategory: input.taxCategory ?? null,
    taxable: r.taxableWithVat,
    base: r.base,
    vat: r.vat,
    // Expense amount = base + nonVat in the default fallback case
    // (when the company has no per-category mapping). The journal lines
    // builder may split this between two accounts when a mapping exists.
    expense: Math.round((r.base + r.exempt) * 100) / 100,
    appliesVat: input.appliesVat !== false,
  };
}

/** Recompute base/vat/exempt on a stored purchase row. */
export { applyMixedTaxToRow, rowNeedsRecalc };

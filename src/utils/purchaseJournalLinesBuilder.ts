/**
 * Purchase Journal Lines Builder.
 *
 * Consumes the centralized accounting engine output and produces accounting
 * lines (debits/credits) for a journal entry. This layer is the ONLY place
 * allowed to map a tax_category → accounting account through the company's
 * `tab_enterprise_config` mapping. Category never determines the account by
 * itself; it only classifies the Non-VAT portion and is then resolved through
 * the company's configuration.
 *
 *   Category → Company Account Mapping → Accounting Account
 */

import {
  calculatePurchaseAccounting,
  type TaxCategoryCode,
} from "./purchaseAccountingEngine";

export interface EnterpriseAccountMapping {
  vat_credit_account_id?: number | null;
  account_non_vat_tourism_id?: number | null;
  account_non_vat_idp_id?: number | null;
  account_non_vat_electricity_id?: number | null;
  account_non_vat_fiscal_stamp_id?: number | null;
  account_non_vat_other_id?: number | null;
}

/**
 * Resolve which accounting account the Non-VAT portion should be posted to,
 * given the classification category and the company's mapping. Returns
 * `null` when the company has no specific mapping for that category — the
 * caller should then fold the amount into the expense account.
 */
export function resolveNonVatAccount(
  category: string | null | undefined,
  mapping: EnterpriseAccountMapping | null | undefined
): number | null {
  if (!category || !mapping) return null;
  const map: Record<string, number | null | undefined> = {
    TOURISM_TAX: mapping.account_non_vat_tourism_id,
    IDP: mapping.account_non_vat_idp_id,
    ELECTRICITY_TAX: mapping.account_non_vat_electricity_id,
    FISCAL_STAMP: mapping.account_non_vat_fiscal_stamp_id,
    OTHER: mapping.account_non_vat_other_id,
  };
  const id = map[category];
  return id != null ? Number(id) : null;
}

export interface PurchaseLineInput {
  total_amount: number;
  exempt_amount?: number | null;
  base_amount?: number | null;
  vat_amount?: number | null;
  tax_category?: string | null;
  fel_document_type?: string | null;
  expense_account_id?: number | null;
  multiplier?: number; // e.g. -1 for credit notes
  appliesVat?: boolean;
}

export interface BuiltAccountingLine {
  account_id: number;
  /** Signed amount (positive = debit, negative = credit). */
  amount: number;
  role: "EXPENSE" | "NON_VAT" | "VAT_CREDIT";
}

/**
 * Build the accounting lines for a single purchase row.
 *
 * Returns 1..3 lines (Expense, optional Non-VAT mapped, optional VAT credit),
 * all expressed as signed amounts already including the multiplier.
 */
export function buildPurchaseLines(
  input: PurchaseLineInput,
  mapping: EnterpriseAccountMapping | null | undefined
): BuiltAccountingLine[] {
  const multiplier = input.multiplier ?? 1;
  const r = calculatePurchaseAccounting({
    totalAmount: Number(input.total_amount) || 0,
    nonVatAmount: Number(input.exempt_amount) || 0,
    taxCategory: input.tax_category ?? null,
    documentType: input.fel_document_type ?? undefined,
    appliesVat: input.appliesVat,
  });

  const lines: BuiltAccountingLine[] = [];

  if (!input.expense_account_id) return lines;

  const nonVatAccount = resolveNonVatAccount(r.taxCategory, mapping);

  // Expense line: base + (nonVat if no specific mapping)
  const expenseAmount = nonVatAccount != null ? r.base : r.base + r.nonVat;
  if (expenseAmount !== 0) {
    lines.push({
      account_id: Number(input.expense_account_id),
      amount: Math.round(expenseAmount * multiplier * 100) / 100,
      role: "EXPENSE",
    });
  }

  // Non-VAT line (only when category is mapped to a specific account)
  if (nonVatAccount != null && r.nonVat !== 0) {
    lines.push({
      account_id: nonVatAccount,
      amount: Math.round(r.nonVat * multiplier * 100) / 100,
      role: "NON_VAT",
    });
  }

  // VAT credit line
  if (r.vat !== 0 && mapping?.vat_credit_account_id) {
    lines.push({
      account_id: Number(mapping.vat_credit_account_id),
      amount: Math.round(r.vat * multiplier * 100) / 100,
      role: "VAT_CREDIT",
    });
  }

  return lines;
}

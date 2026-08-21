/**
 * Shared aggregation of journal detail lines from ledger documents.
 *
 * Single source of truth used by BOTH flows that turn ledger documents into
 * journal entry lines:
 *   1. "Vincular Facturas" (src/components/partidas/useJournalEntryForm.ts)
 *   2. "Generar Póliza" from Libro de Compras / Ventas (src/pages/LibrosFiscales.tsx)
 *
 * Amount logic is NOT reimplemented here: purchases go through the centralized
 * engine (`buildPurchaseLines` → `calculatePurchaseAccounting`), which already
 * honours the enterprise tax regime, FEL document multipliers (NCRE = -1),
 * exempt / non-deductible taxes (IDP, tourism, etc.) and real stored VAT.
 * This module only groups by account and builds the per-supplier/per-invoice
 * descriptions plus traceability (`source_type` / `source_ref`).
 */

import { buildPurchaseLines, type EnterpriseAccountMapping } from "./purchaseJournalLinesBuilder";

export interface AggregatedJournalLine {
  account_id: number;
  description: string;
  debit_amount: number;
  credit_amount: number;
  source_type: "PURCHASE" | "SALE";
  source_ref: string;
}

export interface DocTypeInfo {
  multiplier: number;
  appliesVat: boolean;
}

export type DocTypeMap = Record<string, DocTypeInfo>;

/** Build a docType lookup from `tab_fel_document_types` rows. */
export function buildDocTypeMap(
  rows: Array<{ code: string; affects_total?: number | null; applies_vat?: boolean | null }> | null | undefined
): DocTypeMap {
  const map: DocTypeMap = {};
  (rows || []).forEach((dt) => {
    map[dt.code] = {
      multiplier: dt.affects_total ?? 1,
      appliesVat: dt.applies_vat ?? true,
    };
  });
  return map;
}

/** `FACT B74DD8B3-336414013` — same format both flows use. */
export function formatInvoiceRef(row: {
  fel_document_type?: string | null;
  invoice_series?: string | null;
  invoice_number?: string | null;
}): string {
  const docType = row.fel_document_type || "FACT";
  const series = row.invoice_series ? `${row.invoice_series}-` : "";
  return `${docType} ${series}${row.invoice_number ?? ""}`;
}

export interface PurchaseRowLike {
  fel_document_type?: string | null;
  invoice_series?: string | null;
  invoice_number?: string | null;
  supplier_name?: string | null;
  total_amount: number;
  base_amount?: number | null;
  vat_amount?: number | null;
  exempt_amount?: number | null;
  tax_category?: string | null;
  expense_account_id?: number | null;
}

export interface PurchaseAggregationResult {
  lines: AggregatedJournalLine[];
  /** Signed total of all documents (already multiplied by NCRE sign). */
  totalAmount: number;
  /** Number of documents considered. */
  documentCount: number;
}

/**
 * Aggregate purchase documents into journal detail lines with detailed
 * per-supplier / per-invoice descriptions.
 *
 * @param contraAccountId When provided, appends the credit counterpart line
 *                        (suppliers or bank/cash). Pass `null` to skip it.
 */
export function aggregatePurchaseJournalLines(options: {
  purchases: PurchaseRowLike[];
  docTypeMap: DocTypeMap;
  mapping: EnterpriseAccountMapping | null | undefined;
  enterpriseAppliesVat: boolean;
  contraAccountId?: number | null;
  contraLabel?: string;
}): PurchaseAggregationResult {
  const { purchases, docTypeMap, mapping, enterpriseAppliesVat } = options;
  const contraLabel = options.contraLabel ?? "Proveedores";

  const byAccount: Record<
    number,
    { signed: number; descriptions: string[]; refs: string[]; role: "EXPENSE" | "NON_VAT" | "VAT_CREDIT" }
  > = {};
  const vatRefs: string[] = [];
  let totalAmount = 0;

  for (const p of purchases) {
    const docType = p.fel_document_type || "FACT";
    const { multiplier, appliesVat: docTypeAppliesVat } = docTypeMap[docType] || { multiplier: 1, appliesVat: true };
    const appliesVat = enterpriseAppliesVat && docTypeAppliesVat;
    const ref = formatInvoiceRef(p);
    totalAmount += (Number(p.total_amount) || 0) * multiplier;

    const builtLines = buildPurchaseLines(
      {
        total_amount: Number(p.total_amount) || 0,
        exempt_amount: Number(p.exempt_amount) || 0,
        base_amount: Number(p.base_amount) || 0,
        vat_amount: Number(p.vat_amount) || 0,
        tax_category: p.tax_category ?? null,
        fel_document_type: docType,
        expense_account_id: p.expense_account_id,
        multiplier,
        appliesVat,
      },
      mapping ?? null
    );

    for (const bl of builtLines) {
      const slot = (byAccount[bl.account_id] ||= {
        signed: 0,
        descriptions: [],
        refs: [],
        role: bl.role,
      });
      slot.signed += bl.amount;
      if (bl.role === "EXPENSE") {
        slot.descriptions.push(`${p.supplier_name || "Proveedor"} - ${ref}`);
        slot.refs.push(ref);
      } else if (bl.role === "VAT_CREDIT") {
        vatRefs.push(ref);
      } else if (bl.role === "NON_VAT") {
        slot.refs.push(ref);
      }
    }
  }

  const lines: AggregatedJournalLine[] = [];

  for (const [accountId, data] of Object.entries(byAccount)) {
    const amount = Number(data.signed.toFixed(2));
    if (amount === 0) continue;
    let description: string;
    let sourceRef: string;
    if (data.role === "VAT_CREDIT") {
      description = `IVA Crédito Fiscal - ${vatRefs.length} factura(s)`;
      sourceRef = vatRefs.join(", ");
    } else if (data.role === "NON_VAT") {
      description = `Impuestos no acreditables - ${data.refs.length} factura(s)`;
      sourceRef = data.refs.join(", ");
    } else {
      description = data.descriptions.join("; ");
      sourceRef = data.refs.join(", ");
    }
    lines.push({
      account_id: Number(accountId),
      description,
      debit_amount: amount >= 0 ? amount : 0,
      credit_amount: amount < 0 ? Math.abs(amount) : 0,
      source_type: "PURCHASE",
      source_ref: sourceRef,
    });
  }

  if (options.contraAccountId) {
    const creditAmount = Number(totalAmount.toFixed(2));
    lines.push({
      account_id: Number(options.contraAccountId),
      description: `${contraLabel} - ${purchases.length} factura(s)`,
      debit_amount: creditAmount < 0 ? Math.abs(creditAmount) : 0,
      credit_amount: creditAmount >= 0 ? creditAmount : 0,
      source_type: "PURCHASE",
      source_ref: purchases.map((p) => formatInvoiceRef(p)).join(", "),
    });
  }

  return { lines, totalAmount, documentCount: purchases.length };
}

export interface SaleRowLike {
  fel_document_type?: string | null;
  invoice_series?: string | null;
  invoice_number?: string | null;
  customer_name?: string | null;
  total_amount: number;
  net_amount?: number | null;
  vat_amount?: number | null;
  income_account_id?: number | null;
}

export interface SalesAggregationResult {
  lines: AggregatedJournalLine[];
  totalAmount: number;
  documentCount: number;
}

/**
 * Aggregate sales documents into journal detail lines with detailed
 * per-customer / per-invoice descriptions.
 *
 * Amounts follow exactly the rules already used by "Generar Póliza" for sales:
 * stored `net_amount` / `vat_amount` / `total_amount` multiplied by the FEL
 * document sign. No VAT is recalculated here.
 */
export function aggregateSalesJournalLines(options: {
  sales: SaleRowLike[];
  docTypeMap: DocTypeMap;
  vatDebitAccountId?: number | null;
  /** Debit counterpart (customers or cash). Pass `null` to skip it. */
  contraAccountId?: number | null;
  contraLabel?: string;
}): SalesAggregationResult {
  const { sales, docTypeMap } = options;
  const contraLabel = options.contraLabel ?? "Clientes";

  const byAccount: Record<number, { net: number; descriptions: string[]; refs: string[] }> = {};
  const vatRefs: string[] = [];
  let totalAmount = 0;
  let totalVAT = 0;

  for (const s of sales) {
    const docType = s.fel_document_type || "FACT";
    const { multiplier } = docTypeMap[docType] || { multiplier: 1, appliesVat: true };
    const ref = formatInvoiceRef(s);

    totalAmount += (Number(s.total_amount) || 0) * multiplier;
    const vat = (Number(s.vat_amount) || 0) * multiplier;
    totalVAT += vat;
    if (vat !== 0) vatRefs.push(ref);

    if (!s.income_account_id) continue;
    const slot = (byAccount[s.income_account_id] ||= { net: 0, descriptions: [], refs: [] });
    slot.net += (Number(s.net_amount) || 0) * multiplier;
    slot.descriptions.push(`${s.customer_name || "Cliente"} - ${ref}`);
    slot.refs.push(ref);
  }

  const lines: AggregatedJournalLine[] = [];

  if (options.contraAccountId) {
    const debitAmount = Number(totalAmount.toFixed(2));
    lines.push({
      account_id: Number(options.contraAccountId),
      description: `${contraLabel} - ${sales.length} factura(s)`,
      debit_amount: debitAmount >= 0 ? debitAmount : 0,
      credit_amount: debitAmount < 0 ? Math.abs(debitAmount) : 0,
      source_type: "SALE",
      source_ref: sales.map((s) => formatInvoiceRef(s)).join(", "),
    });
  }

  for (const [accountId, data] of Object.entries(byAccount)) {
    const amount = Number(data.net.toFixed(2));
    if (amount === 0) continue;
    lines.push({
      account_id: Number(accountId),
      description: data.descriptions.join("; "),
      debit_amount: amount < 0 ? Math.abs(amount) : 0,
      credit_amount: amount >= 0 ? amount : 0,
      source_type: "SALE",
      source_ref: data.refs.join(", "),
    });
  }

  if (options.vatDebitAccountId && Number(totalVAT.toFixed(2)) !== 0) {
    const vatAmount = Number(totalVAT.toFixed(2));
    lines.push({
      account_id: Number(options.vatDebitAccountId),
      description: `IVA Débito Fiscal - ${vatRefs.length} factura(s)`,
      debit_amount: vatAmount < 0 ? Math.abs(vatAmount) : 0,
      credit_amount: vatAmount >= 0 ? vatAmount : 0,
      source_type: "SALE",
      source_ref: vatRefs.join(", "),
    });
  }

  return { lines, totalAmount, documentCount: sales.length };
}

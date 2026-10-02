/**
 * Paso fiscal final de la importación de compras (CSV/Excel/PDF de SAT), con el
 * tipo de operación ya definitivo (mapeo por NIT, masivo o asignado).
 *
 *  b) Exención vigente para (tipo, fecha) → IVA 0, base = total, IDP 0 y sellos
 *     vat_rate_applied / exemption_rule_code.
 *  c) Dentro de la vigencia de una exención pero SIN tipo Combustible: si el archivo
 *     SAT trae IVA 0 y petróleo 0 en un documento que normalmente genera IVA, no se
 *     recalcula (IVA 0, base = total) y el registro queda con advertencia.
 *  d) Control general (solo advertencia): IVA del archivo SAT vs. IVA calculado.
 *
 * Fuera de las ventanas de exención el cálculo no cambia.
 */
import { NO_VAT_DOCUMENT_TYPES, calculateMixedTax } from "./purchaseTaxCalculation";
import {
  resolveExemption, findActiveExemptionWindow, exemptionBadgeLabel, type TaxExemptionRule,
} from "./taxExemption";

/** Campos internos del importador (se eliminan antes del insert, como __sourceRow). */
export interface ImportedPurchaseInternal {
  /** IVA leído del archivo SAT; undefined si la fuente no trae IVA confiable. */
  __satVat?: number;
  /** Petróleo (IDP) leído del archivo SAT; undefined si la fuente no trae la columna. */
  __satIdp?: number;
}

export interface ImportedPurchaseLike extends ImportedPurchaseInternal {
  invoice_date: string;
  invoice_series?: string | null;
  invoice_number: string;
  fel_document_type: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  net_amount: number;
  exempt_amount?: number;
  tax_category?: string | null;
  operation_type_id?: number | null;
  vat_rate_applied?: number | null;
  exemption_rule_code?: string | null;
}

export interface SatVatDifference {
  invoice: string;
  supplier: string;
  total: number;
  satVat: number;
  calculatedVat: number;
}

export interface FinalizedImport<T> {
  record: T;
  /** Exención aplicada (caso b). */
  exempted: boolean;
  /** Advertencia del caso c. */
  warning: string | null;
  /** Diferencia del caso d (|IVA SAT − IVA final| > 0.05). */
  satDifference: SatVatDifference | null;
}

const SAT_VAT_TOLERANCE = 0.05;
const ZERO = 0.005;

const invoiceLabel = (r: { invoice_series?: string | null; invoice_number: string }) =>
  `${r.invoice_series ? `${r.invoice_series}-` : ""}${r.invoice_number}`;

export function finalizeImportedPurchase<T extends ImportedPurchaseLike>(
  record: T,
  ctx: {
    rules: TaxExemptionRule[] | null | undefined;
    operationTypeCode: (id: number | null | undefined) => string | null;
  },
): FinalizedImport<T> {
  const opCode = ctx.operationTypeCode(record.operation_type_id ?? null);
  const exemption = resolveExemption(ctx.rules, opCode, record.invoice_date);
  let next: T = { ...record, vat_rate_applied: null, exemption_rule_code: null };
  let warning: string | null = null;

  if (exemption) {
    // b) Exención: IVA 0, base = total − No afecto (IDP en 0 si la regla lo exonera).
    const r = calculateMixedTax({
      totalAmount: record.total_amount,
      exemptAmount: record.exempt_amount ?? 0,
      documentType: record.fel_document_type,
      taxCategory: record.tax_category ?? null,
      exemption,
    });
    next = {
      ...next,
      base_amount: r.base,
      net_amount: r.base,
      vat_amount: r.vat,
      exempt_amount: r.exempt,
      tax_category: r.exempt > 0 ? (r.taxCategory ?? null) : null,
      vat_rate_applied: exemption.vatRate,
      exemption_rule_code: exemption.code,
    };
  } else {
    // c) Dentro de una ventana de exención, sin tipo Combustible resuelto.
    const window = findActiveExemptionWindow(ctx.rules, record.invoice_date);
    const docType = (record.fel_document_type || "FACT").toUpperCase().trim();
    const generatesVat = !(NO_VAT_DOCUMENT_TYPES as readonly string[]).includes(docType);
    const satVatZero = record.__satVat !== undefined && Math.abs(record.__satVat) <= ZERO;
    const satIdpZero = Math.abs(record.__satIdp ?? 0) <= ZERO;
    const isFuelType = (opCode || "").toUpperCase() === (window?.operation_type_code || "").toUpperCase();
    if (window && !isFuelType && generatesVat && satVatZero && satIdpZero) {
      const total = Number(record.total_amount) || 0;
      next = {
        ...next,
        base_amount: total,
        net_amount: total,
        vat_amount: 0,
        exempt_amount: 0,
        tax_category: null,
      };
      const decree = exemptionBadgeLabel({
        code: window.code, vatRate: 0, blocksIdp: window.blocks_idp,
        legalReference: window.legal_reference, name: window.name,
      }).replace(/^Exonerado\s*/, "") || window.name;
      warning = `IVA 0 en el archivo SAT dentro de la vigencia del ${decree}: asigne tipo de operación Combustible si corresponde`;
    }
  }

  // d) IVA del archivo vs. IVA final.
  let satDifference: SatVatDifference | null = null;
  if (record.__satVat !== undefined) {
    const diff = Math.abs((Number(record.__satVat) || 0) - (Number(next.vat_amount) || 0));
    if (diff > SAT_VAT_TOLERANCE) {
      satDifference = {
        invoice: invoiceLabel(record),
        supplier: record.supplier_name,
        total: Number(record.total_amount) || 0,
        satVat: Number(record.__satVat) || 0,
        calculatedVat: Number(next.vat_amount) || 0,
      };
    }
  }

  return { record: next, exempted: !!exemption, warning, satDifference };
}

/** Quita los campos internos (__sourceRow, __satVat, __satIdp) antes del insert. */
export function stripImportInternals<T extends ImportedPurchaseInternal & { __sourceRow?: number }>(
  record: T,
): Omit<T, "__sourceRow" | "__satVat" | "__satIdp"> {
  const { __sourceRow: _row, __satVat: _vat, __satIdp: _idp, ...rest } = record;
  return rest;
}

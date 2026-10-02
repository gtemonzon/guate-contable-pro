/**
 * Exenciones temporales de IVA/IDP en compras (tab_tax_exemption_rules).
 *
 * Ejemplo: Decreto 22-2026 — combustibles (tipo de operación COMBUSTIBLE) del
 * 2026-10-01 al 2026-12-31: IVA 0, IDP 0, base = total.
 *
 * Las fechas se comparan como strings 'YYYY-MM-DD' (orden lexicográfico = orden
 * cronológico), sin convertir a Date, para no depender de la zona horaria.
 * La base de datos aplica la misma regla en el trigger trg_purchase_apply_tax_exemption.
 */
import { exemptionFromStamp, type PurchaseTaxExemption } from "./purchaseTaxCalculation";

export interface TaxExemptionRule {
  id: number;
  code: string;
  name: string;
  legal_reference: string | null;
  operation_type_code: string;
  applies_to: string;
  valid_from: string;
  valid_to: string | null;
  vat_rate: number;
  blocks_idp: boolean;
  is_active: boolean;
  notes?: string | null;
}

/** Exención resuelta: lo que necesita el motor + datos para mostrar (insignia/tooltip). */
export interface ResolvedTaxExemption extends PurchaseTaxExemption {
  name?: string;
  legalReference?: string | null;
  validFrom?: string;
  validTo?: string | null;
}

/** Normaliza a 'YYYY-MM-DD' (acepta '2026-10-01' o '2026-10-01T00:00:00…'). */
function toIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

function inRange(date: string, from: string, to: string | null): boolean {
  const f = toIsoDate(from);
  if (!f || date < f) return false;
  const t = toIsoDate(to);
  return t === null || date <= t;
}

function toResolved(rule: TaxExemptionRule): ResolvedTaxExemption {
  return {
    code: rule.code,
    vatRate: Number(rule.vat_rate) || 0,
    blocksIdp: !!rule.blocks_idp,
    name: rule.name,
    legalReference: rule.legal_reference,
    validFrom: rule.valid_from,
    validTo: rule.valid_to,
  };
}

/**
 * Regla activa para (código del tipo de operación, fecha de factura). Misma lógica
 * que get_active_tax_exemption: la de valid_from más reciente.
 */
export function resolveExemption(
  rules: TaxExemptionRule[] | null | undefined,
  operationTypeCode: string | null | undefined,
  invoiceDate: string | null | undefined,
): ResolvedTaxExemption | null {
  const date = toIsoDate(invoiceDate);
  const code = (operationTypeCode || "").trim().toUpperCase();
  if (!rules?.length || !date || !code) return null;
  const match = rules
    .filter((r) =>
      r.is_active &&
      r.applies_to === "PURCHASE" &&
      (r.operation_type_code || "").trim().toUpperCase() === code &&
      inRange(date, r.valid_from, r.valid_to),
    )
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : a.valid_from > b.valid_from ? -1 : 0))[0];
  return match ? toResolved(match) : null;
}

/** ¿La fecha cae dentro de la vigencia de alguna regla activa (de cualquier tipo)? */
export function findActiveExemptionWindow(
  rules: TaxExemptionRule[] | null | undefined,
  invoiceDate: string | null | undefined,
): TaxExemptionRule | null {
  const date = toIsoDate(invoiceDate);
  if (!rules?.length || !date) return null;
  return rules.find((r) => r.is_active && r.applies_to === "PURCHASE" && inRange(date, r.valid_from, r.valid_to)) ?? null;
}

/**
 * Exención de una fila del libro: con las reglas cargadas se resuelve en vivo (así
 * un cambio de fecha o de tipo la activa o la quita); si las reglas aún no cargan,
 * se usa el sello guardado (exemption_rule_code) para no mostrar 12% de más.
 */
export function resolveRowExemption(
  row: {
    invoice_date?: string | null;
    exemption_rule_code?: string | null;
    vat_rate_applied?: number | string | null;
  },
  operationTypeCode: string | null | undefined,
  rules: TaxExemptionRule[] | null | undefined,
  rulesLoaded: boolean,
): ResolvedTaxExemption | null {
  if (rulesLoaded) return resolveExemption(rules, operationTypeCode, row.invoice_date);
  return exemptionFromStamp(row);
}

/** "dd/mm/aaaa" a partir de 'YYYY-MM-DD'. */
export function formatExemptionDate(value: string | null | undefined): string {
  const v = toIsoDate(value);
  if (!v) return "";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

/** Texto corto para la insignia, p. ej. "Exonerado Decreto 22-2026". */
export function exemptionBadgeLabel(ex: ResolvedTaxExemption | null | undefined): string {
  const ref = ex?.legalReference || ex?.name || "";
  const decree = ref.match(/Decreto\s+[\d-]+/i)?.[0];
  if (decree) return `Exonerado ${decree}`;
  return ex?.name?.trim() || "Exonerado";
}

/** Texto del tooltip: regla y vigencia. */
export function exemptionTooltip(ex: ResolvedTaxExemption | null | undefined): string {
  if (!ex) return "";
  const parts = [ex.name || ex.code];
  if (ex.legalReference) parts.push(ex.legalReference);
  if (ex.validFrom) {
    parts.push(`Vigencia: ${formatExemptionDate(ex.validFrom)} – ${ex.validTo ? formatExemptionDate(ex.validTo) : "sin fecha de fin"}`);
  }
  parts.push("IVA 0, base = total" + (ex.blocksIdp ? ", sin IDP" : ""));
  return parts.join(" · ");
}

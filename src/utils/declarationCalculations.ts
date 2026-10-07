import { TaxFormType, OtroValorISR } from "@/hooks/useDeclaracionCalculo";

export interface DeclarationCalculationInputs {
  credito_remanente: number;
  exencion_iva: number;
  retencion_isr: number;
  retencion_iva_pequeno: number;
  inventario_final_estimado: number;
  otros_valores: OtroValorISR[];
  isr_pagado_anterior: number;
}

export interface DeclarationCalculationRow {
  id: number;
  enterprise_id: number;
  form_type: string;
  period_month: number | null;
  period_year: number;
  inputs: unknown;
  result: unknown;
  created_by: string | null;
  created_at: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);

/** Extrae el "total a pagar" del jsonb `result` según el tipo de formulario. */
export function getCalculationTotal(formType: string, result: unknown): number | null {
  if (!isRecord(result)) return null;
  switch (formType) {
    case "IVA_GENERAL":
      return num(result.ivaAPagar);
    case "IVA_PEQUENO":
      return num(result.impuestoAPagar);
    case "ISR_MENSUAL":
      return num(result.isrAPagar);
    case "ISR_TRIMESTRAL":
      return num(result.isrAPagar);
    case "ISO_TRIMESTRAL":
      return num(result.impuestoTrimestral);
    default:
      return null;
  }
}

/** Convierte los inputs guardados (jsonb) a valores tipados y seguros. */
export function parseCalculationInputs(inputs: unknown): DeclarationCalculationInputs {
  const base: DeclarationCalculationInputs = {
    credito_remanente: 0,
    exencion_iva: 0,
    retencion_isr: 0,
    retencion_iva_pequeno: 0,
    inventario_final_estimado: 0,
    otros_valores: [],
    isr_pagado_anterior: 0,
  };
  if (!isRecord(inputs)) return base;

  const otros: OtroValorISR[] = [];
  if (Array.isArray(inputs.otros_valores)) {
    for (const item of inputs.otros_valores) {
      if (!isRecord(item)) continue;
      otros.push({
        id: typeof item.id === "string" ? item.id : String(otros.length),
        label: typeof item.label === "string" ? item.label : "",
        amount: num(item.amount),
        sign: item.sign === -1 ? -1 : 1,
      });
    }
  }

  return {
    credito_remanente: num(inputs.credito_remanente),
    exencion_iva: num(inputs.exencion_iva),
    retencion_isr: num(inputs.retencion_isr),
    retencion_iva_pequeno: num(inputs.retencion_iva_pequeno),
    inventario_final_estimado: num(inputs.inventario_final_estimado),
    otros_valores: otros,
    isr_pagado_anterior: num(inputs.isr_pagado_anterior),
  };
}

/**
 * Mapea el texto libre de `tax_type` (tab_tax_forms) al dominio TaxFormType
 * usado por los cálculos guardados.
 */
export function mapTaxTypeToFormType(taxType: string | null | undefined): TaxFormType | null {
  if (!taxType) return null;
  const t = taxType
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (t.includes("IVA")) {
    return t.includes("PEQUE") ? "IVA_PEQUENO" : "IVA_GENERAL";
  }
  if (t.includes("ISO")) return "ISO_TRIMESTRAL";
  if (t.includes("ISR")) {
    if (t.includes("TRIMESTRAL")) return "ISR_TRIMESTRAL";
    if (t.includes("MENSUAL") || t.includes("OPCION")) return "ISR_MENSUAL";
    return null;
  }
  return null;
}

/** Mes de inicio del trimestre: 1-3 → 1, 4-6 → 4, 7-9 → 7, 10-12 → 10. */
export function quarterStartMonth(month: number): number {
  return Math.floor((month - 1) / 3) * 3 + 1;
}

/** Texto de `tax_type` (tab_tax_forms) para un tipo de cálculo. Inverso de mapTaxTypeToFormType. */
export function formTypeToTaxType(formType: TaxFormType): string {
  switch (formType) {
    case "IVA_GENERAL": return "IVA GENERAL";
    case "IVA_PEQUENO": return "IVA PEQUEÑO CONTRIBUYENTE";
    case "ISR_MENSUAL": return "ISR MENSUAL";
    case "ISR_TRIMESTRAL": return "ISR TRIMESTRAL";
    case "ISO_TRIMESTRAL": return "ISO TRIMESTRAL";
  }
}

/** Tipo de período del formulario: mensual o trimestral. */
export function formTypeToPeriodType(formType: TaxFormType): "mensual" | "trimestral" {
  return formType === "ISR_TRIMESTRAL" || formType === "ISO_TRIMESTRAL" ? "trimestral" : "mensual";
}

/**
 * Mes con que se registra el formulario: el mes elegido en los mensuales y el mes de
 * inicio del trimestre (1, 4, 7, 10) en los trimestrales.
 */
export function periodMonthForForm(formType: TaxFormType, month: number): number {
  return formTypeToPeriodType(formType) === "trimestral" ? quarterStartMonth(month) : month;
}

/** Campos del resultado guardado de IVA General que usa el Dashboard. */
export interface IvaGeneralResultFields {
  debitoFiscal: number;
  creditoFiscal: number;
  creditoRemanente: number;
  exencionIVA: number;
  ivaAPagar: number;
  creditoRemanenteProximoMes: number;
}

/** Lee el `result` (jsonb) de un cálculo IVA_GENERAL; 0 en cada campo ausente o inválido. */
export function parseIvaGeneralResult(result: unknown): IvaGeneralResultFields {
  const r = isRecord(result) ? result : {};
  return {
    debitoFiscal: num(r.debitoFiscal),
    creditoFiscal: num(r.creditoFiscal),
    creditoRemanente: num(r.creditoRemanente),
    exencionIVA: num(r.exencionIVA),
    ivaAPagar: num(r.ivaAPagar),
    creditoRemanenteProximoMes: num(r.creditoRemanenteProximoMes),
  };
}

/** Campos del resultado guardado de IVA Pequeño Contribuyente. */
export interface IvaPequenoResultFields {
  totalIngresos: number;
  tasaImpuesto: number;
  retencionIVARealizada: number;
  impuestoAPagar: number;
}

/** Lee el `result` (jsonb) de un cálculo IVA_PEQUENO; 0 en cada campo ausente o inválido. */
export function parseIvaPequenoResult(result: unknown): IvaPequenoResultFields {
  const r = isRecord(result) ? result : {};
  return {
    totalIngresos: num(r.totalIngresos),
    tasaImpuesto: num(r.tasaImpuesto),
    retencionIVARealizada: num(r.retencionIVARealizada),
    impuestoAPagar: num(r.impuestoAPagar),
  };
}

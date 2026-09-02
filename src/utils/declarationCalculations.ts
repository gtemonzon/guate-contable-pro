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

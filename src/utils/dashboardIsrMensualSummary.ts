/**
 * Resumen de ISR Mensual del Dashboard: si hay un cálculo guardado del Generador de
 * Declaraciones para el mes, manda ese (incluye retenciones y ajustes manuales); si no,
 * se estima con los libros.
 */
import type { IsrMensualResultFields } from "./declarationCalculations";
import type { SavedCalcMeta } from "./dashboardIvaSummary";

const TASA_PRIMER_TRAMO = 0.05;
const TASA_SEGUNDO_TRAMO = 0.07;

/** Valores estimados con libros (primerTramo y segundoTramo = IMPUESTO de cada tramo). */
export interface IsrMensualEstimate {
  ingresosBrutos: number;
  primerTramo: number;
  segundoTramo: number;
  isrCalculado: number;
}

/**
 * Ingresos del mes para el ISR mensual con la definición del Generador de
 * Declaraciones: TODAS las ventas (incluidos los documentos exentos de IVA, p. ej.
 * FPEQ) por net_amount con el signo de cada tipo de documento.
 */
export function isrMensualIngresos(
  sales: ReadonlyArray<{ net_amount: number | string | null; fel_document_type: string | null }>,
  signOf: (docType: string | null) => number,
): number {
  return sales.reduce((s, r) => s + Number(r.net_amount || 0) * signOf(r.fel_document_type), 0);
}

/** Estimación con la escala del ISR mensual: 5% hasta Q30,000 y 7% el excedente. */
export function estimateIsrMensual(ingresos: number): IsrMensualEstimate {
  const UMBRAL = 30000;
  if (ingresos <= UMBRAL) {
    const primerTramo = ingresos * TASA_PRIMER_TRAMO;
    return { ingresosBrutos: ingresos, primerTramo, segundoTramo: 0, isrCalculado: primerTramo };
  }
  const primerTramo = UMBRAL * TASA_PRIMER_TRAMO; // 1,500
  const segundoTramo = (ingresos - UMBRAL) * TASA_SEGUNDO_TRAMO;
  return { ingresosBrutos: ingresos, primerTramo, segundoTramo, isrCalculado: primerTramo + segundoTramo };
}

export interface IsrMensualSummary {
  source: "saved" | "estimate";
  ingresos: number;
  /** Impuesto del primer tramo (5%). */
  tax1: number;
  /** Impuesto del segundo tramo (7%). */
  tax2: number;
  isrBruto: number;
  retention: number;
  isrToPay: number;
  savedAt: string | null;
  savedCalcId: number | null;
  /** Los libros cambiaron desde el cálculo guardado (más de Q1 en ingresos). */
  stale: boolean;
}

export function buildIsrMensualSummary({
  estimate,
  liveComparable,
  saved,
}: {
  estimate: IsrMensualEstimate;
  /** Ingresos en vivo con la definición del generador (todas las ventas, con signo). */
  liveComparable: number;
  saved: (SavedCalcMeta & IsrMensualResultFields) | null;
}): IsrMensualSummary {
  if (saved) {
    return {
      source: "saved",
      ingresos: saved.ingresosBrutos,
      // El guardado trae la BASE de cada tramo; la tarjeta muestra el impuesto.
      tax1: saved.primerTramo * TASA_PRIMER_TRAMO,
      tax2: saved.segundoTramo * TASA_SEGUNDO_TRAMO,
      isrBruto: saved.isrBruto,
      retention: saved.retencionRealizada,
      isrToPay: saved.isrAPagar,
      savedAt: saved.createdAt,
      savedCalcId: saved.id,
      stale: Math.abs(liveComparable - saved.ingresosBrutos) > 1,
    };
  }
  return {
    source: "estimate",
    ingresos: estimate.ingresosBrutos,
    tax1: estimate.primerTramo,
    tax2: estimate.segundoTramo,
    isrBruto: estimate.isrCalculado,
    retention: 0,
    isrToPay: estimate.isrCalculado,
    savedAt: null,
    savedCalcId: null,
    stale: false,
  };
}

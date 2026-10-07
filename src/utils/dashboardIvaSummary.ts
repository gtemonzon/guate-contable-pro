/**
 * Resumen de IVA del Dashboard: si hay un cálculo guardado del Generador de
 * Declaraciones para el mes, manda ese (incluye remanente y ajustes manuales); si no,
 * se estima con los libros y el remanente contable sugerido.
 */
import type { IvaGeneralResultFields, IvaPequenoResultFields } from "./declarationCalculations";

export interface SavedCalcMeta {
  id: number;
  createdAt: string;
}

export interface IvaGeneralSummary {
  source: "saved" | "estimate";
  debit: number;
  credit: number;
  carryoverIn: number;
  exemption: number;
  ivaToPay: number;
  carryoverOut: number;
  /** ivaToPay si hay impuesto; si no, −carryoverOut (negativo = crédito). */
  ivaBalance: number;
  savedAt: string | null;
  savedCalcId: number | null;
  /** Los libros cambiaron desde el cálculo guardado (más de Q1 en débito o crédito). */
  stale: boolean;
}

export function buildIvaGeneralSummary({
  salesVat,
  purchasesVat,
  saved,
  suggestedCarryover,
}: {
  salesVat: number;
  purchasesVat: number;
  saved: (SavedCalcMeta & IvaGeneralResultFields) | null;
  suggestedCarryover: number;
}): IvaGeneralSummary {
  if (saved) {
    const ivaToPay = saved.ivaAPagar;
    const carryoverOut = saved.creditoRemanenteProximoMes;
    return {
      source: "saved",
      debit: saved.debitoFiscal,
      credit: saved.creditoFiscal,
      carryoverIn: saved.creditoRemanente,
      exemption: saved.exencionIVA,
      ivaToPay,
      carryoverOut,
      ivaBalance: ivaToPay > 0 ? ivaToPay : carryoverOut > 0 ? -carryoverOut : 0,
      savedAt: saved.createdAt,
      savedCalcId: saved.id,
      stale:
        Math.abs(Math.round(salesVat) - saved.debitoFiscal) > 1 ||
        Math.abs(Math.round(purchasesVat) - saved.creditoFiscal) > 1,
    };
  }
  const debit = salesVat;
  const credit = purchasesVat;
  const carryoverIn = suggestedCarryover;
  const ivaToPay = Math.max(0, debit - credit - carryoverIn);
  const carryoverOut = Math.max(0, credit + carryoverIn - debit);
  return {
    source: "estimate",
    debit,
    credit,
    carryoverIn,
    exemption: 0,
    ivaToPay,
    carryoverOut,
    ivaBalance: ivaToPay > 0 ? ivaToPay : carryoverOut > 0 ? -carryoverOut : 0,
    savedAt: null,
    savedCalcId: null,
    stale: false,
  };
}

export interface IvaPequenoSummary {
  source: "saved" | "estimate";
  ingresos: number;
  rate: number;
  retention: number;
  tax: number;
  savedAt: string | null;
  savedCalcId: number | null;
  stale: boolean;
}

export function buildIvaPequenoSummary({
  liveIngresos,
  rate,
  saved,
}: {
  liveIngresos: number;
  rate: number;
  saved: (SavedCalcMeta & IvaPequenoResultFields) | null;
}): IvaPequenoSummary {
  if (saved) {
    return {
      source: "saved",
      ingresos: saved.totalIngresos,
      rate: saved.tasaImpuesto,
      retention: saved.retencionIVARealizada,
      tax: saved.impuestoAPagar,
      savedAt: saved.createdAt,
      savedCalcId: saved.id,
      stale: Math.abs(Math.round(liveIngresos) - saved.totalIngresos) > 1,
    };
  }
  return {
    source: "estimate",
    ingresos: liveIngresos,
    rate,
    retention: 0,
    tax: liveIngresos * rate / 100,
    savedAt: null,
    savedCalcId: null,
    stale: false,
  };
}

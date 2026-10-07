/**
 * ISR Trimestral (SAT-1341): piso fiscal, compras brutas e inventario final sugerido.
 * Run with: bunx vitest run src/utils/isrTrimestral.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import {
  accountBalanceAt, excludeCostClosingEntries, grossPurchases, inventarioFinalCorte,
} from "./isrTrimestral";

const INV = 10; // inventario
const COMPRAS = 20;
const COSTO = 30; // costo de ventas (tipo 'costo')
const CAJA = 40;

let n = 0;
const line = (entry, date, account, debit, credit = 0) => ({
  journal_entry_id: entry, entry_date: date, account_id: account, debit, credit, _n: n++,
});

// Empresa 26: aperturas cada 1 de enero que arrastran el saldo y cierres CDV al 31/12.
const inventario = [
  line(1, "2023-01-01", INV, 33875),            // apertura 2023
  line(2, "2023-12-31", INV, 19365, 33875),     // CDV-2023: real 19,365
  line(3, "2024-01-01", INV, 19365),            // apertura 2024
  line(4, "2024-12-31", INV, 10800, 19365),     // CDV-2024: real 10,800
  line(5, "2025-01-01", INV, 10800),            // apertura 2025
  line(6, "2025-12-31", INV, 5000, 10800),      // CDV-2025-0001: real 5,000
  line(7, "2026-01-01", INV, 5000),             // apertura 2026
  line(8, "2026-06-30", INV, 2000, 5000),       // PART-2026-06-0004: real 2,000
];

describe("accountBalanceAt (piso fiscal)", () => {
  it("(a) aperturas encadenadas: 5,000 con piso y 35,165 sin piso", () => {
    expect(accountBalanceAt(inventario, INV, "2025-12-31", "2025-01-01")).toBe(5000);
    expect(accountBalanceAt(inventario, INV, "2025-12-31", null)).toBe(35165);
  });
  it("saldo al 30/06/2026 desde la apertura 2026", () => {
    expect(accountBalanceAt(inventario, INV, "2026-06-30", "2026-01-01")).toBe(2000);
  });
  it("(d) sin apertura: suma todo el historial hasta la fecha", () => {
    const sinApertura = [line(1, "2024-03-01", INV, 700), line(2, "2025-02-01", INV, 300, 100)];
    expect(accountBalanceAt(sinApertura, INV, "2025-12-31", null)).toBe(900);
  });
  it("ignora otras cuentas y fechas posteriores", () => {
    const lines = [...inventario, line(9, "2025-06-01", CAJA, 999), line(10, "2026-01-02", INV, 50)];
    expect(accountBalanceAt(lines, INV, "2025-12-31", "2025-01-01")).toBe(5000);
  });
});

describe("compras brutas (excludeCostClosingEntries)", () => {
  // Compras ene–jun 112,388.78; PART-2026-06-0004 traslada todo a costo; jul–sep 51,980.05.
  const compras = [
    line(100, "2026-02-10", COMPRAS, 69700.79), line(100, "2026-02-10", CAJA, 0, 69700.79),
    line(101, "2026-05-15", COMPRAS, 42687.99), line(101, "2026-05-15", CAJA, 0, 42687.99),
    // Traslado a costo de ventas: Costo D 115,388.78 = Inv inicial 5,000 + Compras 112,388.78 − Inv final 2,000
    line(102, "2026-06-30", COSTO, 115388.78),
    line(102, "2026-06-30", INV, 2000, 5000),
    line(102, "2026-06-30", COMPRAS, 0, 112388.78),
    line(103, "2026-08-20", COMPRAS, 52480.05), line(103, "2026-08-20", CAJA, 0, 52480.05),
    // Nota de crédito de compras: resta
    line(104, "2026-09-05", COMPRAS, 0, 500), line(104, "2026-09-05", CAJA, 500),
  ];
  const until = (d) => compras.filter((l) => l.entry_date <= d);

  it("(b) excluye la partida de traslado completa", () => {
    const out = excludeCostClosingEntries(compras, [COSTO]);
    expect(out.some((l) => l.journal_entry_id === 102)).toBe(false);
    expect(out).toHaveLength(compras.length - 3);
  });
  it("(b) T3: compras brutas ene–sep = 164,368.83 (antes daba 51,980.05)", () => {
    expect(grossPurchases(until("2026-09-30"), COMPRAS, [COSTO])).toBe(164368.83);
    expect(grossPurchases(until("2026-09-30"), COMPRAS, [])).toBe(51980.05);
  });
  it("T2: 112,388.78 y costo = 5,000 + 112,388.78 − 2,000 = 115,388.78", () => {
    const c = grossPurchases(until("2026-06-30"), COMPRAS, [COSTO]);
    expect(c).toBe(112388.78);
    expect(Math.round((5000 + c - 2000) * 100) / 100).toBe(115388.78);
  });
  it("T1: 69,700.79", () => {
    expect(grossPurchases(until("2026-03-31"), COMPRAS, [COSTO])).toBe(69700.79);
  });
  it("(d) sin cuentas tipo 'costo': comportamiento anterior (neto)", () => {
    expect(excludeCostClosingEntries(compras, [])).toEqual(compras);
  });
});

describe("(c) inventarioFinalCorte por trimestre", () => {
  it("T1: último inventario real al 31/12 del año anterior", () => {
    expect(inventarioFinalCorte(1, 2026)).toEqual({ fecha: "2025-12-31", origen: "último inventario real (al 31/12/2025)" });
  });
  it("T2: saldo contable al 30/06", () => {
    expect(inventarioFinalCorte(2, 2026)).toEqual({ fecha: "2026-06-30", origen: "saldo contable al 30/06/2026" });
  });
  it("T3: último inventario real al 30/06", () => {
    expect(inventarioFinalCorte(3, 2026)).toEqual({ fecha: "2026-06-30", origen: "último inventario real (al 30/06/2026)" });
  });
  it("T4: saldo contable al 31/12", () => {
    expect(inventarioFinalCorte(4, 2026)).toEqual({ fecha: "2026-12-31", origen: "saldo contable al 31/12/2026" });
  });
  it("T3-2026 empresa 26: sugerido 2,000 y costo 167,368.83", () => {
    const corte = inventarioFinalCorte(3, 2026);
    const sugerido = accountBalanceAt(inventario, INV, corte.fecha, "2026-01-01");
    expect(sugerido).toBe(2000);
    expect(Math.round((5000 + 164368.83 - sugerido) * 100) / 100).toBe(167368.83);
  });
});

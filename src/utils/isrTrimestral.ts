/**
 * Funciones puras del cálculo contable del ISR Trimestral (SAT-1341).
 *
 * Las consultas a la base viven en useDeclaracionCalculo; aquí solo la lógica que se
 * puede probar sin base de datos.
 */

/** Línea de partida contable (contabilizada y no borrada) con la fecha de su partida. */
export interface IsrLedgerLine {
  journal_entry_id: number;
  entry_date: string; // 'YYYY-MM-DD'
  account_id: number;
  debit: number;
  credit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Saldo (débito − crédito) de una cuenta al cierre de `untilInclusive`, contando solo
 * desde el piso fiscal (`fiscalFloor` = última partida de apertura <= esa fecha). La
 * apertura ya arrastra el saldo de los años anteriores: sumar lo previo al piso lo
 * contaría dos veces. Sin piso (la empresa no tiene apertura) se suma todo el historial.
 */
export function accountBalanceAt(
  lines: readonly IsrLedgerLine[],
  accountId: number,
  untilInclusive: string,
  fiscalFloor: string | null,
): number {
  let total = 0;
  for (const l of lines) {
    if (l.account_id !== accountId) continue;
    const date = String(l.entry_date).slice(0, 10);
    if (date > untilInclusive) continue;
    if (fiscalFloor && date < fiscalFloor) continue;
    total += (Number(l.debit) || 0) - (Number(l.credit) || 0);
  }
  return round2(total);
}

/**
 * Quita las partidas que tienen al menos una línea en una cuenta de tipo 'costo': son
 * los traslados de compras a costo de ventas (CDV, ajustes de inventario) y no son
 * compras. Sin cuentas tipo 'costo' devuelve las líneas sin cambios.
 */
export function excludeCostClosingEntries<T extends { journal_entry_id: number; account_id: number }>(
  lines: readonly T[],
  costAccountIds: Iterable<number>,
): T[] {
  const costIds = new Set(costAccountIds);
  if (costIds.size === 0) return [...lines];
  const closingEntries = new Set<number>();
  for (const l of lines) {
    if (costIds.has(l.account_id)) closingEntries.add(l.journal_entry_id);
  }
  return lines.filter((l) => !closingEntries.has(l.journal_entry_id));
}

/**
 * Compras brutas del período: movimiento neto (débito − crédito) de la cuenta de
 * compras, sin las partidas de traslado a costo de ventas. Una compra suma y una nota
 * de crédito de compras resta, como siempre.
 */
export function grossPurchases(
  lines: readonly IsrLedgerLine[],
  purchasesAccountId: number,
  costAccountIds: Iterable<number>,
): number {
  let total = 0;
  for (const l of excludeCostClosingEntries(lines, costAccountIds)) {
    if (l.account_id === purchasesAccountId) total += (Number(l.debit) || 0) - (Number(l.credit) || 0);
  }
  return round2(total);
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export function formatDmy(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export interface InventarioFinalCorte {
  /** Fecha (inclusive) del saldo contable de inventario que se sugiere. */
  fecha: string;
  /** Texto del origen que se muestra junto al sugerido. */
  origen: string;
}

/**
 * Corte del inventario final sugerido para el trimestre:
 * - T2 (30/06) y T4 (31/12): saldo contable a fin de trimestre.
 * - T1 y T3: último saldo de cierre de semestre disponible (31/12 del año anterior
 *   para el T1, 30/06 para el T3), como referencia que el contador ajusta.
 */
export function inventarioFinalCorte(trimestre: number, year: number): InventarioFinalCorte {
  switch (trimestre) {
    case 1: {
      const fecha = `${year - 1}-12-31`;
      return { fecha, origen: `último inventario real (al ${formatDmy(fecha)})` };
    }
    case 2: {
      const fecha = `${year}-06-30`;
      return { fecha, origen: `saldo contable al ${formatDmy(fecha)}` };
    }
    case 3: {
      const fecha = `${year}-06-30`;
      return { fecha, origen: `último inventario real (al ${formatDmy(fecha)})` };
    }
    default: {
      const fecha = `${year}-12-31`;
      return { fecha, origen: `saldo contable al ${formatDmy(fecha)}` };
    }
  }
}

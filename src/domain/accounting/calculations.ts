/**
 * Pure accounting domain functions — no framework dependencies, fully unit-testable.
 *
 * These functions encapsulate all core accounting calculation logic
 * that was previously scattered across Dashboard.tsx.
 */

import type { AccountBalance, AccountRecord, KPIMetric, MovementRecord } from './types';

export const BALANCE_TOLERANCE = 0.01;

// ---------------------------------------------------------------------------
// Account balance calculation
// ---------------------------------------------------------------------------

/**
 * Compute the natural balance for an account.
 * Debit-natured accounts: balance = debits - credits
 * Credit-natured accounts: balance = credits - debits
 */
export function computeAccountBalance(
  account: Pick<AccountRecord, 'account_type' | 'balance_type'>,
  debits: number,
  credits: number
): number {
  const isDebitNature =
    account.balance_type === 'deudor' ||
    account.account_type === 'activo' ||
    account.account_type === 'gasto';
  return isDebitNature ? debits - credits : credits - debits;
}

/**
 * Aggregate raw movement records into per-account debit/credit totals.
 */
export function aggregateMovements(movements: MovementRecord[]): Map<number, { debits: number; credits: number }> {
  const map = new Map<number, { debits: number; credits: number }>();
  for (const mov of movements) {
    const existing = map.get(mov.account_id) ?? { debits: 0, credits: 0 };
    existing.debits  += Number(mov.debit_amount  || 0);
    existing.credits += Number(mov.credit_amount || 0);
    map.set(mov.account_id, existing);
  }
  return map;
}

/**
 * Apply movement aggregates to an account list to produce balances.
 */
export function applyMovementsToAccounts(
  accounts: AccountRecord[],
  movementMap: Map<number, { debits: number; credits: number }>
): AccountBalance[] {
  return accounts.map((acc) => {
    const mov = movementMap.get(acc.id) ?? { debits: 0, credits: 0 };
    return {
      ...acc,
      balance: computeAccountBalance(acc, mov.debits, mov.credits),
    };
  });
}

// ---------------------------------------------------------------------------
// KPI calculations
// ---------------------------------------------------------------------------

/**
 * Sum balances for a specific account type.
 */
export function sumBalancesByType(
  balances: AccountBalance[],
  accountType: string
): number {
  return balances
    .filter((b) => b.account_type === accountType)
    .reduce((sum, b) => sum + b.balance, 0);
}

/**
 * Sum balances where account code starts with a given prefix.
 */
export function sumBalancesByCodePrefix(
  balances: AccountBalance[],
  ...prefixes: string[]
): number {
  return balances
    .filter((b) => prefixes.some((p) => b.account_code.startsWith(p)))
    .reduce((sum, b) => sum + b.balance, 0);
}

/**
 * Calculate current-ratio liquidity (current assets / current liabilities).
 * Returns -1 when there are current assets but no current liabilities (excellent liquidity).
 */
export function calculateLiquidity(
  currentAssets: number,
  currentLiabilities: number
): number {
  if (currentLiabilities > 0) return currentAssets / currentLiabilities;
  return currentAssets > 0 ? -1 : 0; // -1 = "infinite" (no liabilities)
}

/**
 * Calculate profit for a period: ingresos - gastos.
 * Expects movements already filtered to income/expense accounts.
 */
export function calculateProfit(movements: (MovementRecord & { account_type: string })[]): number {
  let ingresos = 0;
  let gastos   = 0;
  for (const mov of movements) {
    const debit  = Number(mov.debit_amount  || 0);
    const credit = Number(mov.credit_amount || 0);
    if (mov.account_type === 'ingreso') ingresos += credit - debit;
    if (mov.account_type === 'gasto')   gastos   += debit  - credit;
  }
  return ingresos - gastos;
}

// ---------------------------------------------------------------------------
// Percentage change & trend helpers
// ---------------------------------------------------------------------------

/**
 * Percentage change from `previous` to `current`.
 * Returns null when previous is 0 and current is also 0.
 */
export function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return current !== 0 ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Derive trend direction from a numeric change value.
 * Use `invertLogic = true` for metrics where a decrease is positive (e.g. liabilities).
 */
export function deriveTrend(
  change: number | null,
  invertLogic = false
): 'up' | 'down' | 'neutral' {
  if (change === null) return 'neutral';
  if (invertLogic) return change > 0 ? 'down' : change < 0 ? 'up' : 'neutral';
  return change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
}

/**
 * Build a KPIMetric object from current and previous values.
 */
export function buildKpiMetric(
  current: number,
  previous: number,
  invertTrend = false
): KPIMetric {
  const change = percentageChange(current, previous);
  return {
    value: current,
    change,
    trend: deriveTrend(change, invertTrend),
  };
}

// ---------------------------------------------------------------------------
// Journal entry balance validation
// ---------------------------------------------------------------------------

/**
 * Check if debit total equals credit total within tolerance.
 */
export function isEntryBalanced(totalDebit: number, totalCredit: number): boolean {
  return Math.abs(totalDebit - totalCredit) < BALANCE_TOLERANCE && totalDebit > 0;
}

/**
 * Compute totals from an array of detail lines.
 */
export function computeEntryTotals(
  lines: Array<{ debit_amount: number; credit_amount: number }>
): { totalDebit: number; totalCredit: number; isBalanced: boolean } {
  const totalDebit  = lines.reduce((s, l) => s + (l.debit_amount  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit_amount || 0), 0);
  return { totalDebit, totalCredit, isBalanced: isEntryBalanced(totalDebit, totalCredit) };
}

// ---------------------------------------------------------------------------
// Number formatting helpers (pure — no React/i18n dependency)
// ---------------------------------------------------------------------------

/**
 * Format a number in Guatemalan locale with 2 decimals.
 */
export function formatGTQ(amount: number): string {
  return amount.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format KPI percentage change for display.
 */
export function formatChange(change: number | null | undefined, isPercentage = true): string {
  if (change === null || change === undefined) return 'N/A';
  const sign = change >= 0 ? '+' : '';
  return isPercentage ? `${sign}${change.toFixed(1)}%` : `${sign}${change.toFixed(2)}`;
}

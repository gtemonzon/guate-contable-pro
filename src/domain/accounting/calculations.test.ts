/**
 * Unit tests for core accounting domain functions.
 * Run with: bunx vitest run src/domain/accounting/calculations.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import {
  computeAccountBalance,
  aggregateMovements,
  applyMovementsToAccounts,
  sumBalancesByType,
  calculateLiquidity,
  calculateProfit,
  percentageChange,
  deriveTrend,
  buildKpiMetric,
  isEntryBalanced,
  computeEntryTotals,
  formatGTQ,
  formatChange,
} from './calculations';
import type { AccountRecord, MovementRecord } from './types';

// ---------------------------------------------------------------------------
// computeAccountBalance
// ---------------------------------------------------------------------------
describe('computeAccountBalance', () => {
  it('debit-natured activo: debits - credits', () => {
    expect(computeAccountBalance({ account_type: 'activo', balance_type: null }, 1000, 300)).toBe(700);
  });
  it('credit-natured pasivo: credits - debits', () => {
    expect(computeAccountBalance({ account_type: 'pasivo', balance_type: null }, 200, 1000)).toBe(800);
  });
  it('explicit balance_type=deudor overrides account_type', () => {
    // pasivo but marked deudor (unusual, but should respect balance_type)
    expect(computeAccountBalance({ account_type: 'pasivo', balance_type: 'deudor' }, 500, 100)).toBe(400);
  });
  it('gasto is debit-natured', () => {
    expect(computeAccountBalance({ account_type: 'gasto', balance_type: null }, 800, 200)).toBe(600);
  });
  it('ingreso is credit-natured', () => {
    expect(computeAccountBalance({ account_type: 'ingreso', balance_type: null }, 100, 500)).toBe(400);
  });
  it('zero movements yields zero balance', () => {
    expect(computeAccountBalance({ account_type: 'activo', balance_type: null }, 0, 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateMovements
// ---------------------------------------------------------------------------
describe('aggregateMovements', () => {
  it('sums debits and credits per account_id', () => {
    const movements: MovementRecord[] = [
      { account_id: 1, debit_amount: 100, credit_amount: 0 },
      { account_id: 1, debit_amount: 200, credit_amount: 0 },
      { account_id: 2, debit_amount: 0,   credit_amount: 500 },
    ];
    const map = aggregateMovements(movements);
    expect(map.get(1)).toEqual({ debits: 300, credits: 0 });
    expect(map.get(2)).toEqual({ debits: 0,   credits: 500 });
  });
  it('handles empty array', () => {
    expect(aggregateMovements([])).toEqual(new Map());
  });
  it('treats null/undefined amounts as zero', () => {
    const movements = [{ account_id: 1, debit_amount: null as any, credit_amount: undefined as any }];
    const map = aggregateMovements(movements);
    expect(map.get(1)).toEqual({ debits: 0, credits: 0 });
  });
});

// ---------------------------------------------------------------------------
// applyMovementsToAccounts
// ---------------------------------------------------------------------------
describe('applyMovementsToAccounts', () => {
  const accounts: AccountRecord[] = [
    { id: 1, account_code: '1.1', account_name: 'Caja', account_type: 'activo', balance_type: null },
    { id: 2, account_code: '2.1', account_name: 'Préstamos', account_type: 'pasivo', balance_type: null },
  ];
  it('applies movement map correctly', () => {
    const map = new Map([
      [1, { debits: 1000, credits: 200 }],
      [2, { debits: 100,  credits: 800 }],
    ]);
    const result = applyMovementsToAccounts(accounts, map);
    expect(result[0].balance).toBe(800);  // activo: debits - credits
    expect(result[1].balance).toBe(700);  // pasivo: credits - debits
  });
  it('accounts with no movements get zero balance', () => {
    const result = applyMovementsToAccounts(accounts, new Map());
    expect(result[0].balance).toBe(0);
    expect(result[1].balance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sumBalancesByType
// ---------------------------------------------------------------------------
describe('sumBalancesByType', () => {
  const balances = [
    { id: 1, account_code: '1', account_name: 'A', account_type: 'activo', balance_type: null, balance: 5000 },
    { id: 2, account_code: '2', account_name: 'B', account_type: 'activo', balance_type: null, balance: 3000 },
    { id: 3, account_code: '3', account_name: 'C', account_type: 'pasivo', balance_type: null, balance: 2000 },
  ];
  it('sums activo balances', () => {
    expect(sumBalancesByType(balances, 'activo')).toBe(8000);
  });
  it('sums pasivo balances', () => {
    expect(sumBalancesByType(balances, 'pasivo')).toBe(2000);
  });
  it('returns 0 for unknown type', () => {
    expect(sumBalancesByType(balances, 'patrimonio')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateLiquidity
// ---------------------------------------------------------------------------
describe('calculateLiquidity', () => {
  it('normal ratio', () => {
    expect(calculateLiquidity(10000, 5000)).toBe(2);
  });
  it('returns -1 when assets but no liabilities', () => {
    expect(calculateLiquidity(5000, 0)).toBe(-1);
  });
  it('returns 0 when both are 0', () => {
    expect(calculateLiquidity(0, 0)).toBe(0);
  });
  it('rounds correctly', () => {
    expect(calculateLiquidity(10, 3)).toBeCloseTo(3.333, 2);
  });
});

// ---------------------------------------------------------------------------
// calculateProfit
// ---------------------------------------------------------------------------
describe('calculateProfit', () => {
  it('ingresos - gastos', () => {
    const movements = [
      { account_id: 1, debit_amount: 0,   credit_amount: 5000, account_type: 'ingreso' },
      { account_id: 2, debit_amount: 2000, credit_amount: 0,    account_type: 'gasto' },
    ];
    expect(calculateProfit(movements)).toBe(3000);
  });
  it('loss scenario', () => {
    const movements = [
      { account_id: 1, debit_amount: 0,   credit_amount: 1000, account_type: 'ingreso' },
      { account_id: 2, debit_amount: 3000, credit_amount: 0,    account_type: 'gasto' },
    ];
    expect(calculateProfit(movements)).toBe(-2000);
  });
  it('zero when no movements', () => {
    expect(calculateProfit([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// percentageChange & deriveTrend
// ---------------------------------------------------------------------------
describe('percentageChange', () => {
  it('50% increase', () => {
    expect(percentageChange(150, 100)).toBe(50);
  });
  it('100% decrease', () => {
    expect(percentageChange(0, 100)).toBe(-100);
  });
  it('null when both are 0', () => {
    expect(percentageChange(0, 0)).toBeNull();
  });
  it('100 when previous is 0 and current is positive', () => {
    expect(percentageChange(500, 0)).toBe(100);
  });
});

describe('deriveTrend', () => {
  it('positive change → up', () => expect(deriveTrend(10)).toBe('up'));
  it('negative change → down', () => expect(deriveTrend(-5)).toBe('down'));
  it('null → neutral', () => expect(deriveTrend(null)).toBe('neutral'));
  it('zero → neutral', () => expect(deriveTrend(0)).toBe('neutral'));
  it('inverted: positive → down', () => expect(deriveTrend(10, true)).toBe('down'));
});

describe('buildKpiMetric', () => {
  it('builds metric with correct trend', () => {
    const metric = buildKpiMetric(150, 100);
    expect(metric.value).toBe(150);
    expect(metric.change).toBe(50);
    expect(metric.trend).toBe('up');
  });
  it('inverted trend for liabilities', () => {
    const metric = buildKpiMetric(150, 100, true); // more liabilities = bad
    expect(metric.trend).toBe('down');
  });
});

// ---------------------------------------------------------------------------
// isEntryBalanced & computeEntryTotals
// ---------------------------------------------------------------------------
describe('isEntryBalanced', () => {
  it('balanced within tolerance', () => {
    expect(isEntryBalanced(1000.005, 1000)).toBe(true);
  });
  it('unbalanced', () => {
    expect(isEntryBalanced(1000, 999)).toBe(false);
  });
  it('zero total is not balanced', () => {
    expect(isEntryBalanced(0, 0)).toBe(false);
  });
});

describe('computeEntryTotals', () => {
  it('computes totals and balance flag', () => {
    const lines = [
      { debit_amount: 500, credit_amount: 0 },
      { debit_amount: 0,   credit_amount: 500 },
    ];
    const result = computeEntryTotals(lines);
    expect(result.totalDebit).toBe(500);
    expect(result.totalCredit).toBe(500);
    expect(result.isBalanced).toBe(true);
  });
  it('unbalanced lines', () => {
    const lines = [
      { debit_amount: 500, credit_amount: 0 },
      { debit_amount: 0,   credit_amount: 300 },
    ];
    expect(computeEntryTotals(lines).isBalanced).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
describe('formatGTQ', () => {
  it('formats with 2 decimals', () => {
    expect(formatGTQ(1234.5)).toBe('1,234.50');
  });
  it('formats zero', () => {
    expect(formatGTQ(0)).toBe('0.00');
  });
});

describe('formatChange', () => {
  it('positive percentage', () => {
    expect(formatChange(15.5)).toBe('+15.5%');
  });
  it('negative percentage', () => {
    expect(formatChange(-8.3)).toBe('-8.3%');
  });
  it('null returns N/A', () => {
    expect(formatChange(null)).toBe('N/A');
  });
  it('non-percentage mode', () => {
    expect(formatChange(2.5, false)).toBe('+2.50');
  });
});

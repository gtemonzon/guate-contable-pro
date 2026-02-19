/**
 * Unit tests for Fixed Assets depreciation domain functions.
 * Run with: bunx vitest run src/domain/fixedAssets/calculations.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import {
  computeMonthlyDepreciation,
  generateDepreciationSchedule,
  computeDisposalGainLoss,
  sumDepreciationForPeriod,
  resolveDepreciationStartDate,
} from './calculations';

// ─────────────────────────────────────────────────────────────────────────────
// computeMonthlyDepreciation
// ─────────────────────────────────────────────────────────────────────────────
describe('computeMonthlyDepreciation', () => {
  it('standard straight-line', () => {
    // (10000 - 1000) / 60 = 150
    expect(computeMonthlyDepreciation(10000, 1000, 60)).toBeCloseTo(150, 2);
  });
  it('zero residual', () => {
    expect(computeMonthlyDepreciation(12000, 0, 12)).toBeCloseTo(1000, 2);
  });
  it('returns 0 for zero useful life', () => {
    expect(computeMonthlyDepreciation(10000, 0, 0)).toBe(0);
  });
  it('returns 0 when cost equals residual', () => {
    expect(computeMonthlyDepreciation(5000, 5000, 24)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveDepreciationStartDate
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveDepreciationStartDate', () => {
  it('uses in_service_date when rule is IN_SERVICE_DATE', () => {
    const asset = {
      acquisition_cost: 10000, residual_value: 0, useful_life_months: 12,
      acquisition_date: '2024-01-15',
      in_service_date: '2024-03-01',
      depreciation_start_rule: 'IN_SERVICE_DATE' as const,
    };
    const d = resolveDepreciationStartDate(asset);
    expect(d.getMonth()).toBe(2); // March = 2 (0-indexed)
    expect(d.getFullYear()).toBe(2024);
  });
  it('falls back to acquisition_date if in_service_date is null', () => {
    const asset = {
      acquisition_cost: 10000, residual_value: 0, useful_life_months: 12,
      acquisition_date: '2024-06-01',
      in_service_date: null,
      depreciation_start_rule: 'IN_SERVICE_DATE' as const,
    };
    const d = resolveDepreciationStartDate(asset);
    expect(d.getMonth()).toBe(5); // June = 5
  });
  it('always uses acquisition_date when rule is ACQUISITION_DATE', () => {
    const asset = {
      acquisition_cost: 10000, residual_value: 0, useful_life_months: 12,
      acquisition_date: '2024-01-15',
      in_service_date: '2024-03-01',
      depreciation_start_rule: 'ACQUISITION_DATE' as const,
    };
    const d = resolveDepreciationStartDate(asset);
    expect(d.getMonth()).toBe(0); // January
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateDepreciationSchedule
// ─────────────────────────────────────────────────────────────────────────────
describe('generateDepreciationSchedule', () => {
  const base = {
    acquisition_cost: 12000,
    residual_value: 0,
    useful_life_months: 12,
    acquisition_date: '2024-01-01',
    in_service_date: null,
    depreciation_start_rule: 'ACQUISITION_DATE' as const,
  };

  it('generates correct number of rows', () => {
    expect(generateDepreciationSchedule(base)).toHaveLength(12);
  });

  it('first row has correct amount and accumulated', () => {
    const rows = generateDepreciationSchedule(base);
    expect(rows[0].planned_depreciation_amount).toBe(1000);
    expect(rows[0].accumulated_depreciation).toBe(1000);
    expect(rows[0].net_book_value).toBe(11000);
    expect(rows[0].year).toBe(2024);
    expect(rows[0].month).toBe(1);
  });

  it('last row brings NBV to residual value', () => {
    const rows = generateDepreciationSchedule(base);
    const last = rows[rows.length - 1];
    expect(last.net_book_value).toBeCloseTo(0, 2);
    expect(last.accumulated_depreciation).toBeCloseTo(12000, 2);
  });

  it('total depreciation equals depreciable amount', () => {
    const rows = generateDepreciationSchedule(base);
    const total = rows.reduce((s, r) => s + r.planned_depreciation_amount, 0);
    expect(total).toBeCloseTo(12000, 2);
  });

  it('with residual value: NBV ends at residual', () => {
    const rows = generateDepreciationSchedule({ ...base, residual_value: 1200 });
    const last = rows[rows.length - 1];
    expect(last.net_book_value).toBeCloseTo(1200, 2);
  });

  it('months advance correctly across years', () => {
    const asset = { ...base, acquisition_date: '2024-11-01', useful_life_months: 3 };
    const rows = generateDepreciationSchedule(asset);
    expect(rows[0]).toMatchObject({ year: 2024, month: 11 });
    expect(rows[1]).toMatchObject({ year: 2024, month: 12 });
    expect(rows[2]).toMatchObject({ year: 2025, month: 1 });
  });

  it('returns empty array if depreciable amount is 0', () => {
    expect(generateDepreciationSchedule({ ...base, residual_value: 12000 })).toEqual([]);
  });

  it('rounding drift: last row adjusts for accumulated rounding', () => {
    // 10000 / 3 = 3333.33... per month, total should sum to exactly 10000
    const asset = { ...base, acquisition_cost: 10000, useful_life_months: 3 };
    const rows = generateDepreciationSchedule(asset);
    const total = rows.reduce((s, r) => s + r.planned_depreciation_amount, 0);
    expect(total).toBeCloseTo(10000, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDisposalGainLoss
// ─────────────────────────────────────────────────────────────────────────────
describe('computeDisposalGainLoss', () => {
  it('gain scenario: proceeds > NBV', () => {
    const result = computeDisposalGainLoss(10000, 6000, 5000);
    expect(result.netBookValue).toBe(4000);
    expect(result.gainLoss).toBe(1000);
  });
  it('loss scenario: proceeds < NBV', () => {
    const result = computeDisposalGainLoss(10000, 3000, 2000);
    expect(result.netBookValue).toBe(7000);
    expect(result.gainLoss).toBe(-5000);
  });
  it('break-even: proceeds == NBV', () => {
    const result = computeDisposalGainLoss(10000, 5000, 5000);
    expect(result.gainLoss).toBe(0);
  });
  it('zero proceeds (disposal / write-off)', () => {
    const result = computeDisposalGainLoss(10000, 8000, 0);
    expect(result.netBookValue).toBe(2000);
    expect(result.gainLoss).toBe(-2000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sumDepreciationForPeriod
// ─────────────────────────────────────────────────────────────────────────────
describe('sumDepreciationForPeriod', () => {
  const schedule = [
    { year: 2024, month: 1, planned_depreciation_amount: 1000, accumulated_depreciation: 1000, net_book_value: 11000, status: 'PLANNED' as const },
    { year: 2024, month: 2, planned_depreciation_amount: 1000, accumulated_depreciation: 2000, net_book_value: 10000, status: 'PLANNED' as const },
    { year: 2024, month: 3, planned_depreciation_amount: 1000, accumulated_depreciation: 3000, net_book_value: 9000,  status: 'PLANNED' as const },
    { year: 2024, month: 4, planned_depreciation_amount: 1000, accumulated_depreciation: 4000, net_book_value: 8000,  status: 'PLANNED' as const },
    { year: 2024, month: 5, planned_depreciation_amount: 1000, accumulated_depreciation: 5000, net_book_value: 7000,  status: 'POSTED'  as const },
    { year: 2024, month: 6, planned_depreciation_amount: 1000, accumulated_depreciation: 6000, net_book_value: 6000,  status: 'PLANNED' as const },
  ];

  it('MONTHLY sums only the target month', () => {
    const result = sumDepreciationForPeriod(schedule, 2024, 3, 'MONTHLY');
    expect(result.amount).toBe(1000);
    expect(result.months).toHaveLength(1);
  });

  it('QUARTERLY sums 3 months ending at target', () => {
    const result = sumDepreciationForPeriod(schedule, 2024, 3, 'QUARTERLY');
    expect(result.amount).toBe(3000);
    expect(result.months).toHaveLength(3);
  });

  it('QUARTERLY skips POSTED months (already posted)', () => {
    // Month 5 is POSTED, months 4 and 6 are PLANNED
    const result = sumDepreciationForPeriod(schedule, 2024, 6, 'QUARTERLY');
    // months 4,5,6 → 5 is POSTED so skipped → 1000 + 1000 = 2000
    expect(result.amount).toBe(2000);
  });

  it('ANNUAL sums 12 months', () => {
    const longSchedule = Array.from({ length: 12 }, (_, i) => ({
      year: 2024, month: i + 1,
      planned_depreciation_amount: 500,
      accumulated_depreciation: (i + 1) * 500,
      net_book_value: 6000 - (i + 1) * 500,
      status: 'PLANNED' as const,
    }));
    const result = sumDepreciationForPeriod(longSchedule, 2024, 12, 'ANNUAL');
    expect(result.amount).toBe(6000);
    expect(result.months).toHaveLength(12);
  });
});

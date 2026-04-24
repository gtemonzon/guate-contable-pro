/**
 * Pure domain functions for Fixed Asset depreciation calculations.
 * No framework dependencies — fully unit-testable.
 */

export interface DepreciationScheduleRow {
  year: number;
  month: number;
  planned_depreciation_amount: number;
  accumulated_depreciation: number;
  net_book_value: number;
  status: 'PLANNED' | 'POSTED' | 'SKIPPED';
}

export interface AssetForCalculation {
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  acquisition_date: string;   // YYYY-MM-DD
  in_service_date?: string | null;
  depreciation_start_rule: 'IN_SERVICE_DATE' | 'ACQUISITION_DATE';
}

/**
 * Compute the monthly straight-line depreciation amount (before rounding).
 */
export function computeMonthlyDepreciation(
  acquisitionCost: number,
  residualValue: number,
  usefulLifeMonths: number
): number {
  if (usefulLifeMonths <= 0) return 0;
  return (acquisitionCost - residualValue) / usefulLifeMonths;
}

/**
 * Determine the depreciation start date based on the enterprise policy.
 */
export function resolveDepreciationStartDate(asset: AssetForCalculation): Date {
  if (
    asset.depreciation_start_rule === 'IN_SERVICE_DATE' &&
    asset.in_service_date
  ) {
    return new Date(asset.in_service_date + 'T00:00:00');
  }
  return new Date(asset.acquisition_date + 'T00:00:00');
}

/**
 * Generate the full depreciation schedule for an asset (straight-line only).
 * Returns one row per month for the entire useful life.
 */
export function generateDepreciationSchedule(
  asset: AssetForCalculation,
  roundingDecimals = 2
): DepreciationScheduleRow[] {
  const depreciable = asset.acquisition_cost - asset.residual_value;
  if (depreciable <= 0 || asset.useful_life_months <= 0) return [];

  const round = (n: number) => Math.round(n * 10 ** roundingDecimals) / 10 ** roundingDecimals;
  const monthlyRaw = computeMonthlyDepreciation(
    asset.acquisition_cost,
    asset.residual_value,
    asset.useful_life_months
  );
  const monthly = round(monthlyRaw);

  const startDate = resolveDepreciationStartDate(asset);
  // Snap to first of month
  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  const rows: DepreciationScheduleRow[] = [];
  let accumulated = 0;

  for (let i = 0; i < asset.useful_life_months; i++) {
    // Last period: adjust for rounding drift
    const isLast = i === asset.useful_life_months - 1;
    const amount = isLast ? round(depreciable - accumulated) : monthly;
    accumulated = round(accumulated + amount);
    const nbv = round(asset.acquisition_cost - accumulated);

    rows.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1, // 1-indexed
      planned_depreciation_amount: amount,
      accumulated_depreciation: accumulated,
      net_book_value: nbv,
      status: 'PLANNED',
    });

    // Advance month
    current.setMonth(current.getMonth() + 1);
  }

  return rows;
}

/**
 * Compute disposal gain / loss.
 *
 *   gain_loss = proceeds - net_book_value
 *   positive = gain, negative = loss
 */
export function computeDisposalGainLoss(
  acquisitionCost: number,
  accumulatedDepreciation: number,
  proceedsAmount: number
): { netBookValue: number; gainLoss: number } {
  const netBookValue = acquisitionCost - accumulatedDepreciation;
  const gainLoss = proceedsAmount - netBookValue;
  return { netBookValue, gainLoss };
}

/**
 * Sum depreciation for a set of months (for batch posting).
 * Respects posting frequency: MONTHLY | QUARTERLY | SEMIANNUAL | ANNUAL.
 *
 * Returns separate sums for PLANNED (pending) and POSTED rows so the UI can
 * show what's still pending vs already booked, and decide whether anything
 * remains to be posted for the period.
 */
export function sumDepreciationForPeriod(
  schedule: DepreciationScheduleRow[],
  targetYear: number,
  targetMonth: number, // last month of the posting period
  frequency: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL'
): {
  amount: number; // backwards-compat alias for amountPlanned
  amountPlanned: number;
  amountPosted: number;
  hasPlanned: boolean;
  hasPosted: boolean;
  months: Array<{ year: number; month: number }>;
} {
  const windowSize: Record<string, number> = {
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMIANNUAL: 6,
    ANNUAL: 12,
  };
  const size = windowSize[frequency] ?? 1;

  const months: Array<{ year: number; month: number }> = [];
  let y = targetYear;
  let m = targetMonth;
  for (let i = 0; i < size; i++) {
    months.unshift({ year: y, month: m });
    m--;
    if (m === 0) { m = 12; y--; }
  }

  const inWindow = schedule.filter((row) =>
    months.some((mo) => mo.year === row.year && mo.month === row.month)
  );

  const round = (n: number) => Math.round(n * 100) / 100;

  const plannedRows = inWindow.filter((r) => r.status === 'PLANNED');
  const postedRows = inWindow.filter((r) => r.status === 'POSTED');

  const amountPlanned = round(
    plannedRows.reduce((s, r) => s + r.planned_depreciation_amount, 0)
  );
  const amountPosted = round(
    postedRows.reduce((s, r) => s + r.planned_depreciation_amount, 0)
  );

  return {
    amount: amountPlanned,
    amountPlanned,
    amountPosted,
    hasPlanned: plannedRows.length > 0,
    hasPosted: postedRows.length > 0,
    months,
  };
}

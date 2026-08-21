import { supabase } from "@/integrations/supabase/client";

/**
 * Finds the most recent 'apertura' (opening balance) entry date for an enterprise
 * that is on or before the given reference date.
 * Returns that date as the fiscal floor, or null if none exists (fallback to no floor).
 */
export async function getFiscalFloorDate(
  enterpriseId: number | string,
  referenceDate: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("tab_journal_entries")
    .select("entry_date")
    .eq("enterprise_id", Number(enterpriseId))
    .eq("entry_type", "apertura")
    .eq("is_posted", true)
    .is("deleted_at", null)
    .lte("entry_date", referenceDate)
    .order("entry_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.entry_date;
}

/**
 * Shared guard against double-counting opening balances.
 *
 * An 'apertura' entry already restates the accumulated balance of all prior
 * fiscal years. Therefore any "balance before the range" query MUST be bounded
 * below by the fiscal floor (the apertura date), otherwise the same money is
 * counted twice: once inside the apertura line and once in the pre-range sum.
 *
 * This mirrors the server-side `_fiscal_floor` CTE used by `get_trial_balance`
 * and `get_balance_sheet`, which are the source of truth.
 *
 * Usage:
 *   const floor = await getFiscalFloorDate(enterpriseId, startDate);
 *   let q = supabase.from(...).select(...).lt("tab_journal_entries.entry_date", startDate);
 *   q = applyFiscalFloor(q, "tab_journal_entries.entry_date", floor);
 */
export function applyFiscalFloor<T extends { gte: (column: string, value: string) => T }>(
  query: T,
  dateColumn: string,
  fiscalFloor: string | null
): T {
  if (!fiscalFloor) return query;
  return query.gte(dateColumn, fiscalFloor);
}

/**
 * Convenience helper: resolves the fiscal floor and tells the caller whether a
 * pre-range balance query is needed at all.
 *
 * When the fiscal floor equals (or is later than) the range start, every prior
 * movement is already represented by the apertura entry that lives inside the
 * range, so the pre-range opening balance must be 0.
 */
export async function resolveOpeningBalanceBounds(
  enterpriseId: number | string,
  startDate: string
): Promise<{ fiscalFloor: string | null; skipPriorBalance: boolean }> {
  const fiscalFloor = await getFiscalFloorDate(enterpriseId, startDate);
  return {
    fiscalFloor,
    skipPriorBalance: !!fiscalFloor && fiscalFloor >= startDate,
  };
}

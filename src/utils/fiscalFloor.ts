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

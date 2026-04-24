import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as any).from(t);

export interface DepreciationRunSummary {
  run_id: string;
  year: number;
  month: number;
  frequency: string;
  asset_count: number;
  total_amount: number;
  executed_at: string;
  actor_user_id: string | null;
}

interface RawEvent {
  id: number;
  asset_id: number;
  actor_user_id: string | null;
  created_at: string;
  metadata_json: {
    run_id?: string;
    amount?: number;
    year?: number;
    month?: number;
    frequency?: string;
  } | null;
}

/**
 * Aggregates POST_DEPRECIATION events from fixed_asset_event_log into
 * one summary row per posting run (grouped by run_id).
 */
export function useDepreciationRuns(enterpriseId: number | null) {
  return useQuery<DepreciationRunSummary[]>({
    queryKey: ["depreciation_runs", enterpriseId],
    enabled: !!enterpriseId,
    queryFn: async () => {
      const { data, error } = await db("fixed_asset_event_log")
        .select("id, asset_id, actor_user_id, created_at, metadata_json")
        .eq("enterprise_id", enterpriseId!)
        .eq("event_type", "POST_DEPRECIATION")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const events = (data ?? []) as RawEvent[];
      const byRun = new Map<string, DepreciationRunSummary>();

      for (const ev of events) {
        const meta = ev.metadata_json ?? {};
        const runId =
          meta.run_id ??
          `legacy-${ev.created_at}-${ev.asset_id}`;
        const existing = byRun.get(runId);
        const amount = Number(meta.amount ?? 0);
        if (existing) {
          existing.asset_count += 1;
          existing.total_amount = Math.round((existing.total_amount + amount) * 100) / 100;
          // keep earliest created_at as executed_at
          if (ev.created_at < existing.executed_at) existing.executed_at = ev.created_at;
        } else {
          byRun.set(runId, {
            run_id: runId,
            year: Number(meta.year ?? 0),
            month: Number(meta.month ?? 0),
            frequency: String(meta.frequency ?? "MONTHLY"),
            asset_count: 1,
            total_amount: Math.round(amount * 100) / 100,
            executed_at: ev.created_at,
            actor_user_id: ev.actor_user_id,
          });
        }
      }

      return Array.from(byRun.values()).sort((a, b) =>
        b.executed_at.localeCompare(a.executed_at)
      );
    },
  });
}

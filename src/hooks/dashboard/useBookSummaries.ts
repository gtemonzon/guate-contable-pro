/**
 * useBookSummaries — fetches the latest purchase & sales book summaries
 * for display in the Dashboard bottom cards.
 *
 * Performance: uses the SQL aggregate RPC `get_book_summaries_latest`
 * which returns at most 4 rows (last two months × two ledgers) instead
 * of pulling raw invoices to the browser.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface BookSummary {
  month: number;
  year: number;
  base: number;
  vat: number;
  total: number;
  count: number;
  previousTotal?: number;
  percentageChange?: number;
}

interface RpcRow {
  ledger: 'purchases' | 'sales';
  year: number;
  month: number;
  base: number;
  vat: number;
  total: number;
  cnt: number;
}

function pickLatest(rows: RpcRow[]): BookSummary | null {
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) =>
    a.year !== b.year ? b.year - a.year : b.month - a.month,
  );
  const last = sorted[0];
  const summary: BookSummary = {
    month: last.month,
    year: last.year,
    base: Number(last.base || 0),
    vat: Number(last.vat || 0),
    total: Number(last.total || 0),
    count: Number(last.cnt || 0),
  };
  if (sorted.length > 1) {
    const prev = sorted[1];
    summary.previousTotal = Number(prev.total || 0);
    if (summary.previousTotal > 0) {
      summary.percentageChange =
        ((summary.total - summary.previousTotal) / summary.previousTotal) * 100;
    }
  }
  return summary;
}

export function useBookSummaries(enterpriseId: number | null) {
  return useQuery({
    queryKey: ['dashboard-book-summaries', enterpriseId],
    enabled: !!enterpriseId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_book_summaries_latest', {
        p_enterprise_id: enterpriseId!,
      });
      if (error) throw error;

      const rows = (data ?? []) as RpcRow[];
      return {
        purchases: pickLatest(rows.filter((r) => r.ledger === 'purchases')),
        sales: pickLatest(rows.filter((r) => r.ledger === 'sales')),
      };
    },
  });
}

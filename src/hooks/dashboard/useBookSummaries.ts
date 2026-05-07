/**
 * useBookSummaries — fetches the latest purchase & sales book summaries
 * for display in the Dashboard bottom cards.
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

async function fetchPurchaseSummary(enterpriseId: number): Promise<BookSummary | null> {
  const { data: purchases } = await supabase
    .from('tab_purchase_ledger')
    .select('invoice_date, net_amount, vat_amount, total_amount')
    .eq('enterprise_id', enterpriseId)
    .order('invoice_date', { ascending: false })
    .limit(2000);

  if (!purchases?.length) return null;

  const grouped: Record<string, BookSummary> = {};
  for (const p of purchases) {
    const d = new Date(p.invoice_date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = { month, year, base: 0, vat: 0, total: 0, count: 0 };
    grouped[key].base += Number(p.net_amount || 0);
    grouped[key].vat += Number(p.vat_amount || 0);
    grouped[key].total += Number(p.total_amount || 0);
    grouped[key].count += 1;
  }

  const sortedKeys = Object.keys(grouped).sort().reverse();
  if (!sortedKeys.length) return null;

  const last = grouped[sortedKeys[0]];
  if (sortedKeys.length > 1) {
    const prev = grouped[sortedKeys[1]];
    last.previousTotal = prev.total;
    if (prev.total > 0) last.percentageChange = ((last.total - prev.total) / prev.total) * 100;
  }

  return last;
}

async function fetchSalesSummary(enterpriseId: number): Promise<BookSummary | null> {
  const { data: sales } = await supabase
    .from('tab_sales_ledger')
    .select('invoice_date, net_amount, vat_amount, total_amount')
    .eq('enterprise_id', enterpriseId)
    .eq('is_annulled', false)
    .order('invoice_date', { ascending: false })
    .limit(500);

  if (!sales?.length) return null;

  const grouped: Record<string, BookSummary> = {};
  for (const s of sales) {
    const d = new Date(s.invoice_date);
    const month = d.getMonth() + 1;
    const year  = d.getFullYear();
    const key   = `${year}-${String(month).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = { month, year, base: 0, vat: 0, total: 0, count: 0 };
    grouped[key].base  += Number(s.net_amount   || 0);
    grouped[key].vat   += Number(s.vat_amount   || 0);
    grouped[key].total += Number(s.total_amount || 0);
    grouped[key].count += 1;
  }

  const sortedKeys = Object.keys(grouped).sort().reverse();
  if (!sortedKeys.length) return null;

  const last = grouped[sortedKeys[0]];
  if (sortedKeys.length > 1) {
    const prev = grouped[sortedKeys[1]];
    last.previousTotal = prev.total;
    if (prev.total > 0) last.percentageChange = ((last.total - prev.total) / prev.total) * 100;
  }

  return last;
}

export function useBookSummaries(enterpriseId: number | null) {
  return useQuery({
    queryKey: ['dashboard-book-summaries', enterpriseId],
    enabled: !!enterpriseId,
    staleTime: 120_000,
    queryFn: async () => {
      const eid = enterpriseId!;
      const [purchases, sales] = await Promise.all([
        fetchPurchaseSummary(eid),
        fetchSalesSummary(eid),
      ]);
      return { purchases, sales };
    },
  });
}

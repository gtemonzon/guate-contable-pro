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
  const { data: books } = await supabase
    .from('tab_purchase_books')
    .select('id, month, year')
    .eq('enterprise_id', enterpriseId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(12);

  if (!books?.length) return null;

  let lastBook: typeof books[0] | null = null;
  let prevBook: typeof books[0] | null = null;
  let lastPurchases: Array<{ net_amount: number; vat_amount: number; total_amount: number }> | null = null;

  for (const book of books) {
    const { data: purchases } = await supabase
      .from('tab_purchase_ledger')
      .select('net_amount, vat_amount, total_amount')
      .eq('purchase_book_id', book.id);
    if (purchases?.length) {
      if (!lastBook) { lastBook = book; lastPurchases = purchases; }
      else if (!prevBook) { prevBook = book; break; }
    }
  }

  if (!lastBook || !lastPurchases) return null;

  const summary: BookSummary = lastPurchases.reduce(
    (acc, curr) => ({
      ...acc,
      base:  acc.base  + Number(curr.net_amount   || 0),
      vat:   acc.vat   + Number(curr.vat_amount   || 0),
      total: acc.total + Number(curr.total_amount || 0),
      count: acc.count + 1,
    }),
    { month: lastBook.month, year: lastBook.year, base: 0, vat: 0, total: 0, count: 0 }
  );

  if (prevBook) {
    const { data: prevPurchases } = await supabase
      .from('tab_purchase_ledger')
      .select('total_amount')
      .eq('purchase_book_id', prevBook.id);
    const prevTotal = prevPurchases?.reduce((s, r) => s + Number(r.total_amount || 0), 0) ?? 0;
    summary.previousTotal = prevTotal;
    if (prevTotal > 0) summary.percentageChange = ((summary.total - prevTotal) / prevTotal) * 100;
  }

  return summary;
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

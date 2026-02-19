/**
 * useYearlyCharts — fetches multi-year monthly sales/purchases data
 * for the yearly comparison charts in the Dashboard.
 * Uses the DB-side get_monthly_ledger_summary function.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MonthlyChartData {
  month: string;
  monthNum: number;
  [year: string]: number | string;
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function initMonthlyData(): MonthlyChartData[] {
  return MONTH_NAMES.map((month, i) => ({ month, monthNum: i + 1 }));
}

async function fetchLedgerSummary(
  enterpriseId: number,
  year: number,
  ledger: 'sales' | 'purchases'
): Promise<Array<{ month_num: number; total: number }>> {
  const { data, error } = await supabase.rpc('get_monthly_ledger_summary', {
    p_enterprise_id: enterpriseId,
    p_year: year,
    p_ledger: ledger,
  });
  if (error) {
    console.warn(`[useYearlyCharts] fallback for ${ledger} ${year}:`, error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({ month_num: Number(r.month_num), total: Number(r.total) }));
}

export function useYearlyCharts(enterpriseId: number | null, selectedYears: number[]) {
  return useQuery({
    queryKey: ['dashboard-yearly-charts', enterpriseId, selectedYears.join(',')],
    enabled: !!enterpriseId && selectedYears.length > 0,
    staleTime: 120_000,
    queryFn: async () => {
      const eid = enterpriseId!;
      const salesData     = initMonthlyData();
      const purchasesData = initMonthlyData();

      await Promise.all(
        selectedYears.flatMap((year) => [
          fetchLedgerSummary(eid, year, 'sales').then((rows) => {
            salesData.forEach((m) => { m[year.toString()] = 0; });
            rows.forEach((r) => { (salesData[r.month_num - 1][year.toString()] as number) += r.total; });
          }),
          fetchLedgerSummary(eid, year, 'purchases').then((rows) => {
            purchasesData.forEach((m) => { m[year.toString()] = 0; });
            rows.forEach((r) => { (purchasesData[r.month_num - 1][year.toString()] as number) += r.total; });
          }),
        ])
      );

      return { salesData, purchasesData };
    },
  });
}

export async function fetchAvailableChartYears(enterpriseId: number): Promise<number[]> {
  const yearsSet = new Set<number>();

  const [{ data: sales }, { data: purchases }] = await Promise.all([
    supabase.from('tab_sales_ledger').select('invoice_date').eq('enterprise_id', enterpriseId).eq('is_annulled', false),
    supabase.from('tab_purchase_ledger').select('invoice_date').eq('enterprise_id', enterpriseId),
  ]);

  sales?.forEach((s) => yearsSet.add(new Date(s.invoice_date).getFullYear()));
  purchases?.forEach((p) => yearsSet.add(new Date(p.invoice_date).getFullYear()));

  return Array.from(yearsSet).sort((a, b) => b - a);
}

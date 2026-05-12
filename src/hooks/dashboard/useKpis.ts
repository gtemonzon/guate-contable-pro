/**
 * useKpis — fetches KPI data (activos, pasivos, utilidad, liquidez)
 *
 * Performance: 1 round-trip via the consolidated `get_dashboard_kpis` RPC,
 * which returns current + previous balances and current + previous profit
 * in a single JSONB payload.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  buildKpiMetric,
  sumBalancesByType,
  sumBalancesByCodePrefix,
  calculateLiquidity,
} from '@/domain/accounting/calculations';
import type { KPIData } from '@/domain/accounting/types';
import type { ActivePeriod } from './useActivePeriod';

interface RpcBalanceRow {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  balance_type: string | null;
  balance: number;
}

function normaliseRpcRows(rows: RpcBalanceRow[]) {
  return rows.map((r) => ({
    id:           r.account_id,
    account_id:   r.account_id,
    account_code: r.account_code,
    account_name: r.account_name,
    account_type: r.account_type as import('@/domain/accounting/types').AccountType,
    balance_type: r.balance_type as import('@/domain/accounting/types').BalanceType | null,
    balance:      Number(r.balance ?? 0),
  }));
}

function buildDateRange(period: ActivePeriod | null): {
  startDate: string; endDate: string;
  prevStartDate: string; prevEndDate: string;
} {
  if (period) {
    const start = new Date(period.start_date);
    const prevStart = new Date(start);
    prevStart.setFullYear(prevStart.getFullYear() - 1);
    const prevEnd = new Date(period.end_date);
    prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    return {
      startDate: period.start_date,
      endDate: period.end_date,
      prevStartDate: prevStart.toISOString().split('T')[0],
      prevEndDate: prevEnd.toISOString().split('T')[0],
    };
  }
  const today = new Date();
  const m = today.getMonth();
  const y = today.getFullYear();
  const pm = m === 0 ? 11 : m - 1;
  const py = m === 0 ? y - 1 : y;
  return {
    startDate: new Date(y, m, 1).toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
    prevStartDate: new Date(py, pm, 1).toISOString().split('T')[0],
    prevEndDate: new Date(py, pm + 1, 0).toISOString().split('T')[0],
  };
}

export function useKpis(enterpriseId: number | null, activePeriod: ActivePeriod | null) {
  return useQuery<KPIData>({
    queryKey: ['dashboard-kpis', enterpriseId, activePeriod?.id],
    enabled: !!enterpriseId,
    staleTime: 60_000,
    queryFn: async () => {
      const { startDate, endDate, prevStartDate, prevEndDate } = buildDateRange(activePeriod);

      // Find the date of the last posted entry within the active period (clamped to endDate).
      // Use it as the effective "as-of" date so KPIs reflect the actual most recent data.
      let effectiveEnd = endDate;
      let effectivePrevEnd = prevEndDate;
      if (enterpriseId) {
        const { data: lastRow } = await supabase
          .from('tab_journal_entries')
          .select('entry_date')
          .eq('enterprise_id', enterpriseId)
          .eq('is_posted', true)
          .is('deleted_at', null)
          .lte('entry_date', endDate)
          .order('entry_date', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastRow?.entry_date) {
          effectiveEnd = lastRow.entry_date;
          const d = new Date(effectiveEnd);
          d.setFullYear(d.getFullYear() - 1);
          effectivePrevEnd = d.toISOString().split('T')[0];
        }
      }

      // Use the same RPCs as the Balance General report so the dashboard KPIs
      // match exactly (excludes closing/transfer/voided entries, applies fiscal floor).
      const yearOf = (d: string) => d.slice(0, 4);
      const currPnlStart = `${yearOf(effectiveEnd)}-01-01`;
      const prevPnlStart = `${yearOf(effectivePrevEnd)}-01-01`;

      const [bsCurr, bsPrev, pnlCurr, pnlPrev] = await Promise.all([
        supabase.rpc('get_balance_sheet', { p_enterprise_id: enterpriseId!, p_as_of_date: effectiveEnd }),
        supabase.rpc('get_balance_sheet', { p_enterprise_id: enterpriseId!, p_as_of_date: effectivePrevEnd }),
        supabase.rpc('get_pnl', { p_enterprise_id: enterpriseId!, p_start_date: currPnlStart, p_end_date: effectiveEnd }),
        supabase.rpc('get_pnl', { p_enterprise_id: enterpriseId!, p_start_date: prevPnlStart, p_end_date: effectivePrevEnd }),
      ]);
      if (bsCurr.error) throw bsCurr.error;
      if (bsPrev.error) throw bsPrev.error;
      if (pnlCurr.error) throw pnlCurr.error;
      if (pnlPrev.error) throw pnlPrev.error;

      const curr = normaliseRpcRows((bsCurr.data ?? []) as RpcBalanceRow[]);
      const prev = normaliseRpcRows((bsPrev.data ?? []) as RpcBalanceRow[]);

      // get_pnl rows: parents have zero direct movements (only leaves carry value),
      // so a straight sum is safe and matches the Balance General "Resultado del Período".
      const sumProfit = (rows: any[]) =>
        rows.reduce((sum: number, r: any) => {
          const t = r.account_type;
          const bal = Number(r.balance ?? 0);
          if (t === 'ingreso') return sum + bal;
          if (t === 'gasto' || t === 'costo') return sum - bal;
          return sum;
        }, 0);
      const profit     = sumProfit((pnlCurr.data ?? []) as any[]);
      const prevProfit = sumProfit((pnlPrev.data ?? []) as any[]);

      const totalActivos = sumBalancesByType(curr, 'activo');
      const totalPasivos = sumBalancesByType(curr, 'pasivo');
      const prevActivos  = sumBalancesByType(prev, 'activo');
      const prevPasivos  = sumBalancesByType(prev, 'pasivo');

      const currentAssets  = sumBalancesByCodePrefix(curr, '1.1', '1-1', '11');
      const currentLiab    = sumBalancesByCodePrefix(curr, '2.1', '2-1', '21');
      const prevCurrAssets = sumBalancesByCodePrefix(prev, '1.1', '1-1', '11');
      const prevCurrLiab   = sumBalancesByCodePrefix(prev, '2.1', '2-1', '21');

      const liquidity     = calculateLiquidity(currentAssets, currentLiab);
      const prevLiquidity = calculateLiquidity(prevCurrAssets, prevCurrLiab);

      return {
        totalActivos:     buildKpiMetric(totalActivos, prevActivos),
        totalPasivos:     buildKpiMetric(totalPasivos, prevPasivos, true),
        utilidadPeriodo:  buildKpiMetric(profit,       prevProfit),
        liquidez: {
          value:  liquidity,
          change: liquidity - prevLiquidity,
          trend:  (liquidity - prevLiquidity) > 0 ? 'up' : (liquidity - prevLiquidity) < 0 ? 'down' : 'neutral',
        },
        asOfDate: effectiveEnd,
      };
    },
  });
}

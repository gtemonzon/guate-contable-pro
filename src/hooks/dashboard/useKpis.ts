/**
 * useKpis — fetches KPI data (activos, pasivos, utilidad, liquidez)
 * using the DB-side `get_account_balances_by_period` and `get_period_profit` functions.
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

// Normalise RPC result (account_id → id) to match AccountBalance
function normaliseRpcRows(rows: RpcBalanceRow[]) {
  return rows.map((r) => ({
    id:           r.account_id,
    account_id:   r.account_id,
    account_code: r.account_code,
    account_name: r.account_name,
    account_type: r.account_type as import('@/domain/accounting/types').AccountType,
    balance_type: r.balance_type as import('@/domain/accounting/types').BalanceType | null,
    balance:      r.balance,
  }));
}

async function fetchBalances(enterpriseId: number, endDate: string) {
  const { data, error } = await supabase.rpc('get_account_balances_by_period', {
    p_enterprise_id: enterpriseId,
    p_end_date: endDate,
  });
  if (error) throw error;
  return normaliseRpcRows((data ?? []) as RpcBalanceRow[]);
}

async function fetchProfit(enterpriseId: number, startDate: string, endDate: string) {
  const { data, error } = await supabase.rpc('get_period_profit', {
    p_enterprise_id: enterpriseId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return Number(data ?? 0);
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
      const eid = enterpriseId!;

      const [curr, prev, profit, prevProfit] = await Promise.all([
        fetchBalances(eid, endDate),
        fetchBalances(eid, prevEndDate),
        fetchProfit(eid, startDate, endDate),
        fetchProfit(eid, prevStartDate, prevEndDate),
      ]);

      const totalActivos = sumBalancesByType(curr, 'activo');
      const totalPasivos = sumBalancesByType(curr, 'pasivo');
      const prevActivos  = sumBalancesByType(prev, 'activo');
      const prevPasivos  = sumBalancesByType(prev, 'pasivo');

      const currentAssets = sumBalancesByCodePrefix(curr, '1.1', '1-1', '11');
      const currentLiab   = sumBalancesByCodePrefix(curr, '2.1', '2-1', '21');
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
      };
    },
  });
}

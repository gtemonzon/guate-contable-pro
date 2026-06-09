import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRecords } from '@/utils/supabaseHelpers';
import type { EnterpriseConfig } from '@/hooks/useEnterpriseConfig';

export interface EstimatedCogsResult {
  enabled: boolean;
  loading: boolean;
  currentSales: number;
  historicalPercentage: number | null; // 0..1
  estimatedCostOfSales: number | null;
  estimatedGrossProfit: number | null;
  basisPeriodsUsed: number;
  method: 'disabled' | 'last_period' | 'average_n';
  reason?: string; // why we cannot compute (no closed periods, no sales account, etc.)
}

interface Args {
  enterpriseId: number | null;
  config: EnterpriseConfig | null;
  dateFrom: string;
  dateTo: string;
  /** If true (official CoS already shown), skip computing. */
  skip?: boolean;
}

const sumDetails = async (
  accountId: number,
  entryIds: number[],
  mode: 'debit_minus_credit' | 'credit_minus_debit'
): Promise<number> => {
  if (entryIds.length === 0) return 0;
  let total = 0;
  const batch = 100;
  for (let i = 0; i < entryIds.length; i += batch) {
    const slice = entryIds.slice(i, i + batch);
    const { data } = await supabase
      .from('tab_journal_entry_details')
      .select('debit_amount, credit_amount')
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .in('journal_entry_id', slice);
    (data || []).forEach((d: { debit_amount: number | null; credit_amount: number | null }) => {
      const dr = Number(d.debit_amount) || 0;
      const cr = Number(d.credit_amount) || 0;
      total += mode === 'debit_minus_credit' ? dr - cr : cr - dr;
    });
  }
  return Math.round(total * 100) / 100;
};

const getPeriodEntryIds = async (enterpriseId: number, periodId: number): Promise<number[]> => {
  const entries = await fetchAllRecords(
    supabase
      .from('tab_journal_entries')
      .select('id')
      .eq('enterprise_id', enterpriseId)
      .eq('accounting_period_id', periodId)
      .eq('is_posted', true)
      .is('deleted_at', null)
      .is('reversal_entry_id', null)
      .is('reversed_by_entry_id', null)
      .in('entry_type', ['diario', 'ajuste'])
  );
  return (entries || []).map((e: { id: number }) => e.id);
};

const getEntryIdsByDateRange = async (
  enterpriseId: number,
  startDate: string,
  endDate: string
): Promise<number[]> => {
  const entries = await fetchAllRecords(
    supabase
      .from('tab_journal_entries')
      .select('id')
      .eq('enterprise_id', enterpriseId)
      .eq('is_posted', true)
      .is('deleted_at', null)
      .is('reversal_entry_id', null)
      .is('reversed_by_entry_id', null)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)
      .in('entry_type', ['diario', 'ajuste'])
  );
  return (entries || []).map((e: { id: number }) => e.id);
};

export function useEstimatedCogs({ enterpriseId, config, dateFrom, dateTo, skip }: Args) {
  const [state, setState] = useState<EstimatedCogsResult>({
    enabled: false,
    loading: false,
    currentSales: 0,
    historicalPercentage: null,
    estimatedCostOfSales: null,
    estimatedGrossProfit: null,
    basisPeriodsUsed: 0,
    method: 'disabled',
  });

  const compute = useCallback(async () => {
    if (!enterpriseId || !config || !dateFrom || !dateTo) return;

    const method = config.estimated_cogs_method || 'disabled';
    if (method === 'disabled' || skip) {
      setState((s) => ({ ...s, enabled: false, method }));
      return;
    }
    if (!config.sales_account_id) {
      setState((s) => ({ ...s, enabled: false, method, reason: 'Cuenta de Ventas no configurada' }));
      return;
    }

    setState((s) => ({ ...s, loading: true, enabled: true, method }));

    try {
      // 1) Current period net sales (over the report date range)
      const currentEntryIds = await getEntryIdsByDateRange(enterpriseId, dateFrom, dateTo);
      const currentSales = await sumDetails(
        config.sales_account_id,
        currentEntryIds,
        'credit_minus_debit'
      );

      // 2) Fetch closed periods (most recent first)
      const limit = method === 'last_period' ? 1 : Math.max(1, Math.min(24, config.estimated_cogs_periods || 3));
      const { data: closedPeriods } = await supabase
        .from('tab_accounting_periods')
        .select('id, start_date, end_date, status')
        .eq('enterprise_id', enterpriseId)
        .eq('status', 'cerrado')
        .order('end_date', { ascending: false })
        .limit(limit);

      if (!closedPeriods || closedPeriods.length === 0) {
        setState({
          enabled: true,
          loading: false,
          currentSales,
          historicalPercentage: null,
          estimatedCostOfSales: null,
          estimatedGrossProfit: null,
          basisPeriodsUsed: 0,
          method,
          reason: 'No hay períodos cerrados para calcular el porcentaje histórico',
        });
        return;
      }

      // 3) For each closed period compute CoS% = actual CoS / net sales
      const percentages: number[] = [];
      for (const p of closedPeriods) {
        const periodEntryIds = await getPeriodEntryIds(enterpriseId, p.id);
        const sales = await sumDetails(config.sales_account_id, periodEntryIds, 'credit_minus_debit');
        if (sales <= 0) continue;

        let actualCos = 0;
        if (config.cost_of_sales_method === 'coeficiente') {
          const { data: closing } = await supabase
            .from('tab_period_inventory_closing')
            .select('cost_of_sales_amount')
            .eq('enterprise_id', enterpriseId)
            .eq('accounting_period_id', p.id)
            .eq('status', 'contabilizado')
            .maybeSingle();
          if (closing && closing.cost_of_sales_amount != null) {
            actualCos = Number(closing.cost_of_sales_amount) || 0;
          } else if (config.cost_of_sales_account_id) {
            actualCos = await sumDetails(config.cost_of_sales_account_id, periodEntryIds, 'debit_minus_credit');
          }
        } else {
          // manual: use the configured cost of sales account if any, otherwise purchases account as fallback
          if (config.cost_of_sales_account_id) {
            actualCos = await sumDetails(config.cost_of_sales_account_id, periodEntryIds, 'debit_minus_credit');
          } else if (config.purchases_account_id) {
            actualCos = await sumDetails(config.purchases_account_id, periodEntryIds, 'debit_minus_credit');
          }
        }

        if (actualCos > 0) {
          percentages.push(actualCos / sales);
        }
      }

      if (percentages.length === 0) {
        setState({
          enabled: true,
          loading: false,
          currentSales,
          historicalPercentage: null,
          estimatedCostOfSales: null,
          estimatedGrossProfit: null,
          basisPeriodsUsed: 0,
          method,
          reason: 'No fue posible derivar un porcentaje histórico de costo de ventas',
        });
        return;
      }

      const percentage =
        method === 'last_period'
          ? percentages[0]
          : percentages.reduce((a, b) => a + b, 0) / percentages.length;

      const estCos = Math.round(currentSales * percentage * 100) / 100;
      const estGross = Math.round((currentSales - estCos) * 100) / 100;

      setState({
        enabled: true,
        loading: false,
        currentSales,
        historicalPercentage: percentage,
        estimatedCostOfSales: estCos,
        estimatedGrossProfit: estGross,
        basisPeriodsUsed: percentages.length,
        method,
      });
    } catch (err) {
      console.error('Error computing estimated CoS:', err);
      setState((s) => ({ ...s, loading: false, reason: 'Error al calcular' }));
    }
  }, [enterpriseId, config, dateFrom, dateTo, skip]);

  useEffect(() => {
    compute();
  }, [compute]);

  return state;
}

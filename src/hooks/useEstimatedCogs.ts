import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRecords } from '@/utils/supabaseHelpers';
import type { EnterpriseConfig } from '@/hooks/useEnterpriseConfig';

export interface RealCogsBreakdown {
  initialInventory: number;
  purchases: number;
  availableForSale: number;
  finalInventory: number;
  /** CoS derived from inventory identity: available - final. */
  derivedCostOfSales: number;
  /** CoS actually posted in the period (movement in CoS account). */
  postedCostOfSales: number;
  /** True when derived and posted CoS agree within Q0.01. */
  matches: boolean;
}

export interface EstimatedCogsResult {
  enabled: boolean;
  loading: boolean;
  currentSales: number;
  historicalPercentage: number | null; // 0..1
  estimatedCostOfSales: number | null;
  estimatedGrossProfit: number | null;
  basisPeriodsUsed: number;
  method: 'disabled' | 'last_period' | 'average_n';
  // Inventory analysis (projection) — reporting only
  beginningInventory: number;
  purchasesInPeriod: number;
  availableInventory: number;
  estimatedEndingInventory: number | null;
  /** Real breakdown derived from posted movements — shown when period already
   *  has both a posted Cost of Sales and an inventory adjustment. */
  realBreakdown: RealCogsBreakdown | null;
  reason?: string;
}

interface Args {
  enterpriseId: number | null;
  config: EnterpriseConfig | null;
  dateFrom: string;
  dateTo: string;
  /** If true (official CoS already shown), skip computing. */
  skip?: boolean;
}

const EMPTY: EstimatedCogsResult = {
  enabled: false,
  loading: false,
  currentSales: 0,
  historicalPercentage: null,
  estimatedCostOfSales: null,
  estimatedGrossProfit: null,
  basisPeriodsUsed: 0,
  method: 'disabled',
  beginningInventory: 0,
  purchasesInPeriod: 0,
  realBreakdown: null,
  availableInventory: 0,
  estimatedEndingInventory: null,
};

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
  const [state, setState] = useState<EstimatedCogsResult>(EMPTY);

  const compute = useCallback(async () => {
    if (!enterpriseId || !config || !dateFrom || !dateTo) return;

    const method = config.estimated_cogs_method || 'disabled';
    if (method === 'disabled' || skip) {
      setState({ ...EMPTY, method });
      return;
    }
    if (!config.sales_account_id) {
      setState({ ...EMPTY, method, reason: 'Cuenta de Ventas no configurada' });
      return;
    }

    setState((s) => ({ ...s, loading: true, enabled: true, method }));

    try {
      // 1) Current period entries + net sales + purchases
      const currentEntryIds = await getEntryIdsByDateRange(enterpriseId, dateFrom, dateTo);
      const currentSales = await sumDetails(
        config.sales_account_id,
        currentEntryIds,
        'credit_minus_debit'
      );
      const purchasesInPeriod = config.purchases_account_id
        ? await sumDetails(config.purchases_account_id, currentEntryIds, 'debit_minus_credit')
        : 0;

      // 1.b) Detect real posted CoS + inventory movement in the period.
      const invAccountId = config.inventory_account_id ?? config.initial_inventory_account_id ?? null;
      const [realCos, invMovement] = await Promise.all([
        config.cost_of_sales_account_id
          ? sumDetails(config.cost_of_sales_account_id, currentEntryIds, 'debit_minus_credit')
          : Promise.resolve(0),
        invAccountId
          ? sumDetails(invAccountId, currentEntryIds, 'debit_minus_credit')
          : Promise.resolve(0),
      ]);

      // 2) Beginning inventory — from most recent contabilizado closing before dateFrom
      let beginningInventory = 0;
      const { data: lastClosing } = await supabase
        .from('tab_period_inventory_closing')
        .select('final_inventory_amount, accounting_period_id, tab_accounting_periods!inner(end_date)')
        .eq('enterprise_id', enterpriseId)
        .eq('status', 'contabilizado')
        .lt('tab_accounting_periods.end_date', dateFrom)
        .order('accounting_period_id', { ascending: false })
        .limit(1);
      if (lastClosing && lastClosing.length > 0 && lastClosing[0].final_inventory_amount != null) {
        beginningInventory = Number(lastClosing[0].final_inventory_amount) || 0;
      } else if (config.inventory_account_id || config.initial_inventory_account_id) {
        // Fallback: opening balance of inventory account up to (dateFrom - 1)
        const invAccId = (config.inventory_account_id ?? config.initial_inventory_account_id) as number;
        const priorIds = await fetchAllRecords(
          supabase
            .from('tab_journal_entries')
            .select('id')
            .eq('enterprise_id', enterpriseId)
            .eq('is_posted', true)
            .is('deleted_at', null)
            .is('reversal_entry_id', null)
            .is('reversed_by_entry_id', null)
            .lt('entry_date', dateFrom)
            .in('entry_type', ['diario', 'ajuste', 'apertura'])
        );
        beginningInventory = await sumDetails(invAccId, (priorIds || []).map((e: { id: number }) => e.id), 'debit_minus_credit');
      }

      // 1.c) If the period already has posted CoS + an inventory movement, build
      // a REAL breakdown from posted balances instead of showing a projection.
      if (Math.abs(realCos) > 0.005 && Math.abs(invMovement) > 0.005) {
        const finalInventory = Math.round((beginningInventory + invMovement) * 100) / 100;
        const availableForSale = Math.round((beginningInventory + purchasesInPeriod) * 100) / 100;
        const derivedCos = Math.round((availableForSale - finalInventory) * 100) / 100;
        const postedCos = Math.round(realCos * 100) / 100;
        setState({
          ...EMPTY,
          method,
          enabled: false,
          currentSales,
          purchasesInPeriod,
          beginningInventory,
          availableInventory: availableForSale,
          realBreakdown: {
            initialInventory: beginningInventory,
            purchases: purchasesInPeriod,
            availableForSale,
            finalInventory,
            derivedCostOfSales: derivedCos,
            postedCostOfSales: postedCos,
            matches: Math.abs(derivedCos - postedCos) < 0.01,
          },
        });
        return;
      }


      // 3) Fetch closed periods (most recent first)
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
          ...EMPTY,
          enabled: true,
          method,
          currentSales,
          purchasesInPeriod,
          beginningInventory,
          availableInventory: beginningInventory + purchasesInPeriod,
          reason: 'No hay períodos cerrados para calcular el porcentaje histórico',
        });
        return;
      }

      // 4) For each closed period compute CoS% = actual CoS / net sales
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
          ...EMPTY,
          enabled: true,
          method,
          currentSales,
          purchasesInPeriod,
          beginningInventory,
          availableInventory: beginningInventory + purchasesInPeriod,
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
      const available = Math.round((beginningInventory + purchasesInPeriod) * 100) / 100;
      const estEnding = Math.round((available - estCos) * 100) / 100;

      setState({
        enabled: true,
        loading: false,
        currentSales,
        historicalPercentage: percentage,
        estimatedCostOfSales: estCos,
        estimatedGrossProfit: estGross,
        basisPeriodsUsed: percentages.length,
        method,
        beginningInventory,
        purchasesInPeriod,
        availableInventory: available,
        estimatedEndingInventory: estEnding,
        realBreakdown: null,
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

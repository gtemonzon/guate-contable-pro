import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEnterpriseConfig, EnterpriseConfig } from '@/hooks/useEnterpriseConfig';
import { fetchAllRecords } from '@/utils/supabaseHelpers';
import { toast } from 'sonner';

interface ClosingData {
  id: number;
  initial_inventory_amount: number;
  purchases_amount: number;
  final_inventory_amount: number | null;
  cost_of_sales_amount: number | null;
  status: string;
  journal_entry_id: number | null;
  calculated_at: string | null;
}

interface PeriodData {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

export function useCostOfSalesCalculation(enterpriseId: number, periodId: number) {
  const { config } = useEnterpriseConfig(enterpriseId);
  const [closingData, setClosingData] = useState<ClosingData | null>(null);
  const [initialInventory, setInitialInventory] = useState(0);
  const [purchasesAmount, setPurchasesAmount] = useState(0);
  const [finalInventory, setFinalInventory] = useState<number | null>(null);
  const [costOfSales, setCostOfSales] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsRecalculation, setNeedsRecalculation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPeriodData = async (): Promise<PeriodData | null> => {
    const { data, error } = await supabase
      .from('tab_accounting_periods')
      .select('id, year, start_date, end_date, status')
      .eq('id', periodId)
      .single();
    if (error) throw error;
    return data;
  };

  const calculateInitialInventory = async (period: PeriodData): Promise<number> => {
    if (!config?.inventory_account_id) return 0;

    // Include entries BEFORE period start + opening entries ON the start date
    const [entriesBefore, openingEntries] = await Promise.all([
      fetchAllRecords(
        supabase
          .from('tab_journal_entries')
          .select('id')
          .eq('enterprise_id', enterpriseId)
          .eq('is_posted', true)
          .is('deleted_at', null)
          .lt('entry_date', period.start_date)
      ),
      fetchAllRecords(
        supabase
          .from('tab_journal_entries')
          .select('id')
          .eq('enterprise_id', enterpriseId)
          .eq('is_posted', true)
          .is('deleted_at', null)
          .eq('entry_date', period.start_date)
          .eq('entry_type', 'apertura')
      ),
    ]);

    const allEntries = [...(entriesBefore || []), ...(openingEntries || [])];
    if (allEntries.length === 0) return 0;

    const entryIds = allEntries.map((e: any) => e.id);
    
    // Fetch details in batches
    let totalBalance = 0;
    const batchSize = 100;
    for (let i = 0; i < entryIds.length; i += batchSize) {
      const batch = entryIds.slice(i, i + batchSize);
      const { data: details, error: detailsError } = await supabase
        .from('tab_journal_entry_details')
        .select('debit_amount, credit_amount')
        .eq('account_id', config.inventory_account_id)
        .is('deleted_at', null)
        .in('journal_entry_id', batch);

      if (detailsError) throw detailsError;
      
      (details || []).forEach((d: any) => {
        totalBalance += (Number(d.debit_amount) || 0) - (Number(d.credit_amount) || 0);
      });
    }

    return Math.round(totalBalance * 100) / 100;
  };

  const calculatePurchases = async (period: PeriodData): Promise<number> => {
    if (!config?.purchases_account_id) return 0;

    const entries = await fetchAllRecords(
      supabase
        .from('tab_journal_entries')
        .select('id')
        .eq('enterprise_id', enterpriseId)
        .eq('accounting_period_id', periodId)
        .eq('is_posted', true)
        .is('deleted_at', null)
        .neq('entry_type', 'apertura')
    );

    if (!entries || entries.length === 0) return 0;

    const entryIds = entries.map((e: any) => e.id);
    
    let totalBalance = 0;
    const batchSize = 100;
    for (let i = 0; i < entryIds.length; i += batchSize) {
      const batch = entryIds.slice(i, i + batchSize);
      const { data: details, error: detailsError } = await supabase
        .from('tab_journal_entry_details')
        .select('debit_amount, credit_amount')
        .eq('account_id', config.purchases_account_id)
        .is('deleted_at', null)
        .in('journal_entry_id', batch);

      if (detailsError) throw detailsError;
      
      (details || []).forEach((d: any) => {
        totalBalance += (Number(d.debit_amount) || 0) - (Number(d.credit_amount) || 0);
      });
    }

    return Math.round(totalBalance * 100) / 100;
  };

  const loadExistingClosing = async (): Promise<ClosingData | null> => {
    const { data, error } = await supabase
      .from('tab_period_inventory_closing')
      .select('*')
      .eq('enterprise_id', enterpriseId)
      .eq('accounting_period_id', periodId)
      .maybeSingle();

    if (error) throw error;
    return data as ClosingData | null;
  };

  const calculate = useCallback(async () => {
    if (!config) return;

    setLoading(true);
    setError(null);
    try {
      const period = await getPeriodData();
      if (!period) throw new Error('Período no encontrado');

      const [invInitial, purchases, existing] = await Promise.all([
        calculateInitialInventory(period),
        calculatePurchases(period),
        loadExistingClosing(),
      ]);

      setInitialInventory(invInitial);
      setPurchasesAmount(purchases);
      setClosingData(existing);

      if (existing) {
        setFinalInventory(existing.final_inventory_amount);
        // Check if recalculation needed
        if (
          Math.abs(existing.initial_inventory_amount - invInitial) > 0.01 ||
          Math.abs(existing.purchases_amount - purchases) > 0.01
        ) {
          setNeedsRecalculation(true);
        } else {
          setNeedsRecalculation(false);
        }
        // Recalculate cost of sales with current values
        if (existing.final_inventory_amount !== null) {
          setCostOfSales(Math.round((invInitial + purchases - existing.final_inventory_amount) * 100) / 100);
        } else {
          setCostOfSales(null);
        }
      } else {
        setFinalInventory(null);
        setCostOfSales(null);
        setNeedsRecalculation(false);
      }
    } catch (err: any) {
      console.error('Error calculating cost of sales:', err);
      setError(err.message || 'Error en el cálculo');
      toast.error('Error al calcular costo de ventas');
    } finally {
      setLoading(false);
    }
  }, [config, enterpriseId, periodId]);

  const saveFinalInventory = async (amount: number) => {
    if (amount < 0) {
      toast.error('El inventario final no puede ser negativo');
      return;
    }

    setFinalInventory(amount);
    const newCostOfSales = Math.round((initialInventory + purchasesAmount - amount) * 100) / 100;
    setCostOfSales(newCostOfSales);

    try {
      const upsertData = {
        enterprise_id: enterpriseId,
        accounting_period_id: periodId,
        initial_inventory_amount: initialInventory,
        purchases_amount: purchasesAmount,
        final_inventory_amount: amount,
        cost_of_sales_amount: newCostOfSales,
        status: 'borrador' as const,
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (closingData) {
        const { error } = await supabase
          .from('tab_period_inventory_closing')
          .update(upsertData)
          .eq('id', closingData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('tab_period_inventory_closing')
          .insert(upsertData)
          .select()
          .single();
        if (error) throw error;
        setClosingData(data as ClosingData);
      }

      toast.success('Inventario final guardado');
    } catch (err: any) {
      console.error('Error saving final inventory:', err);
      toast.error('Error al guardar inventario final');
    }
  };

  const generateCostOfSalesEntry = async (): Promise<boolean> => {
    if (!config?.inventory_account_id || !config?.purchases_account_id || !config?.cost_of_sales_account_id) {
      toast.error('Faltan cuentas configuradas para el costo de ventas');
      return false;
    }
    if (finalInventory === null || costOfSales === null) {
      toast.error('Debe ingresar el inventario final primero');
      return false;
    }

    setLoading(true);
    let createdEntryId: number | null = null;
    try {
      const period = await getPeriodData();
      if (!period) throw new Error('Período no encontrado');

      const { data: { user } } = await supabase.auth.getUser();

      // Delete existing draft CDV entry if exists (referenced by closingData)
      if (closingData?.journal_entry_id) {
        const { data: existingEntry } = await supabase
          .from('tab_journal_entries')
          .select('id, status')
          .eq('id', closingData.journal_entry_id)
          .single();

        if (existingEntry && existingEntry.status === 'borrador') {
          await supabase
            .from('tab_journal_entry_details')
            .delete()
            .eq('journal_entry_id', existingEntry.id);
          await supabase
            .from('tab_journal_entries')
            .delete()
            .eq('id', existingEntry.id);
        }
      }

      // Also clean up any orphaned CDV draft entries for this period
      const { data: orphanedEntries } = await supabase
        .from('tab_journal_entries')
        .select('id')
        .eq('enterprise_id', enterpriseId)
        .eq('accounting_period_id', periodId)
        .ilike('entry_number', 'CDV-%')
        .eq('status', 'borrador')
        .eq('is_posted', false);

      if (orphanedEntries && orphanedEntries.length > 0) {
        const orphanIds = orphanedEntries.map(e => e.id);
        await supabase
          .from('tab_journal_entry_details')
          .delete()
          .in('journal_entry_id', orphanIds);
        await supabase
          .from('tab_journal_entries')
          .delete()
          .in('id', orphanIds);
      }

      // Generate entry number
      const year = period.year;
      const { data: lastEntry } = await supabase
        .from('tab_journal_entries')
        .select('entry_number')
        .eq('enterprise_id', enterpriseId)
        .ilike('entry_number', `CDV-${year}%`)
        .order('entry_number', { ascending: false })
        .limit(1);

      let nextNumber = 1;
      if (lastEntry && lastEntry.length > 0) {
        const lastNum = lastEntry[0].entry_number.split('-').pop();
        nextNumber = parseInt(lastNum || '0') + 1;
      }
      const entryNumber = `CDV-${year}-${String(nextNumber).padStart(4, '0')}`;

      // Build detail lines first to calculate accurate totals
      const detailLines: any[] = [];
      let lineNumber = 1;
      let calcDebits = 0;
      let calcCredits = 0;

      if (costOfSales > 0) {
        const amt = Math.round(Math.abs(costOfSales) * 100) / 100;
        detailLines.push({
          line_number: lineNumber++,
          account_id: config.cost_of_sales_account_id,
          description: 'Costo de Ventas del período',
          debit_amount: amt,
          credit_amount: 0,
        });
        calcDebits += amt;
      }

      if (initialInventory > 0) {
        const amt = Math.round(initialInventory * 100) / 100;
        detailLines.push({
          line_number: lineNumber++,
          account_id: config.inventory_account_id,
          description: 'Traslado inventario inicial',
          debit_amount: 0,
          credit_amount: amt,
        });
        calcCredits += amt;
      }

      if (purchasesAmount > 0) {
        const amt = Math.round(purchasesAmount * 100) / 100;
        detailLines.push({
          line_number: lineNumber++,
          account_id: config.purchases_account_id,
          description: 'Cierre de compras del período',
          debit_amount: 0,
          credit_amount: amt,
        });
        calcCredits += amt;
      }

      if (finalInventory > 0) {
        const amt = Math.round(finalInventory * 100) / 100;
        detailLines.push({
          line_number: lineNumber++,
          account_id: config.inventory_account_id,
          description: 'Registro inventario final (conteo físico)',
          debit_amount: amt,
          credit_amount: 0,
        });
        calcDebits += amt;
      }

      if (costOfSales < 0) {
        const amt = Math.round(Math.abs(costOfSales) * 100) / 100;
        detailLines.push({
          line_number: lineNumber++,
          account_id: config.cost_of_sales_account_id,
          description: 'Costo de Ventas del período (negativo)',
          debit_amount: 0,
          credit_amount: amt,
        });
        calcCredits += amt;
      }

      calcDebits = Math.round(calcDebits * 100) / 100;
      calcCredits = Math.round(calcCredits * 100) / 100;

      // Insert header as draft
      const { data: newEntry, error: entryError } = await supabase
        .from('tab_journal_entries')
        .insert({
          enterprise_id: enterpriseId,
          accounting_period_id: periodId,
          entry_number: entryNumber,
          entry_date: period.end_date,
          entry_type: 'diario',
          description: `Costo de Ventas por Coeficiente - Período ${year}`,
          total_debit: calcDebits,
          total_credit: calcCredits,
          is_balanced: Math.abs(calcDebits - calcCredits) < 0.01,
          is_posted: false,
          status: 'borrador',
          created_by: user?.id || null,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;
      createdEntryId = newEntry.id;

      // Insert detail lines
      if (detailLines.length > 0) {
        const linesWithEntryId = detailLines.map(l => ({
          ...l,
          journal_entry_id: newEntry.id,
        }));
        const { error: detailsError } = await supabase
          .from('tab_journal_entry_details')
          .insert(linesWithEntryId);
        if (detailsError) throw detailsError;
      }

      // Update or create closing record (avoid stale-state race conditions)
      const closingPayload = {
        enterprise_id: enterpriseId,
        accounting_period_id: periodId,
        initial_inventory_amount: initialInventory,
        purchases_amount: purchasesAmount,
        final_inventory_amount: finalInventory,
        cost_of_sales_amount: costOfSales,
        journal_entry_id: newEntry.id,
        status: 'borrador' as const,
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (closingData) {
        const { data: updatedClosing, error: updateError } = await supabase
          .from('tab_period_inventory_closing')
          .update(closingPayload)
          .eq('id', closingData.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        setClosingData(updatedClosing as ClosingData);
      } else {
        const { data: upsertedClosing, error: upsertError } = await supabase
          .from('tab_period_inventory_closing')
          .upsert(closingPayload, { onConflict: 'enterprise_id,accounting_period_id' })
          .select('*')
          .single();

        if (upsertError) throw upsertError;
        setClosingData(upsertedClosing as ClosingData);
      }

      setNeedsRecalculation(false);

      createdEntryId = null; // success — don't clean up
      toast.success(`Partida de Costo de Ventas ${entryNumber} generada`);
      return true;
    } catch (err: any) {
      console.error('Error generating CDV entry:', err);
      const detail = err?.message || err?.details || 'Error desconocido';
      toast.error(`Error al generar partida CDV: ${detail}`);

      // Clean up partial entry on failure
      if (createdEntryId) {
        try {
          await supabase.from('tab_journal_entry_details').delete().eq('journal_entry_id', createdEntryId);
          await supabase.from('tab_journal_entries').delete().eq('id', createdEntryId);
        } catch { /* ignore cleanup errors */ }
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshCalculation = async () => {
    setLoading(true);
    try {
      const period = await getPeriodData();
      if (!period) throw new Error('Período no encontrado');

      const [invInitial, purchases] = await Promise.all([
        calculateInitialInventory(period),
        calculatePurchases(period),
      ]);

      setInitialInventory(invInitial);
      setPurchasesAmount(purchases);

      // Keep existing finalInventory
      if (finalInventory !== null) {
        const newCost = Math.round((invInitial + purchases - finalInventory) * 100) / 100;
        setCostOfSales(newCost);
      }

      // Delete draft CDV entry if exists
      if (closingData?.journal_entry_id) {
        const { data: existingEntry } = await supabase
          .from('tab_journal_entries')
          .select('id, status')
          .eq('id', closingData.journal_entry_id)
          .single();

        if (existingEntry && existingEntry.status === 'borrador') {
          await supabase
            .from('tab_journal_entry_details')
            .delete()
            .eq('journal_entry_id', existingEntry.id);
          await supabase
            .from('tab_journal_entries')
            .delete()
            .eq('id', existingEntry.id);

          if (closingData) {
            await supabase
              .from('tab_period_inventory_closing')
              .update({
                initial_inventory_amount: invInitial,
                purchases_amount: purchases,
                cost_of_sales_amount: finalInventory !== null ? Math.round((invInitial + purchases - finalInventory) * 100) / 100 : null,
                journal_entry_id: null,
                calculated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', closingData.id);
            
            setClosingData({ ...closingData, journal_entry_id: null });
          }
        }
      }

      setNeedsRecalculation(false);
      toast.success('Cálculo actualizado');
    } catch (err: any) {
      console.error('Error refreshing calculation:', err);
      toast.error('Error al recalcular');
    } finally {
      setLoading(false);
    }
  };

  const postCdvEntry = async () => {
    if (!closingData?.journal_entry_id) return false;

    try {
      const { error } = await supabase
        .from('tab_journal_entries')
        .update({
          is_posted: true,
          status: 'contabilizado',
          posted_at: new Date().toISOString(),
        })
        .eq('id', closingData.journal_entry_id);

      if (error) throw error;

      await supabase
        .from('tab_period_inventory_closing')
        .update({
          status: 'contabilizado',
          confirmed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', closingData.id);

      setClosingData({ ...closingData, status: 'contabilizado' });
      return true;
    } catch (err: any) {
      console.error('Error posting CDV entry:', err);
      toast.error('Error al contabilizar partida CDV');
      return false;
    }
  };

  return {
    config,
    closingData,
    initialInventory,
    purchasesAmount,
    finalInventory,
    costOfSales,
    loading,
    needsRecalculation,
    error,
    calculate,
    saveFinalInventory,
    generateCostOfSalesEntry,
    refreshCalculation,
    postCdvEntry,
  };
}

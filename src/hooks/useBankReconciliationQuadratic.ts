import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface QuadraticData {
  id?: number;
  reconciliation_id: number;
  enterprise_id: number;
  bank_account_id: number;
  initial_balance_bank: number;
  initial_balance_books: number;
  final_balance_bank: number;
  final_balance_books: number;
  total_income_bank: number;
  total_income_books: number;
  total_expenses_bank: number;
  total_expenses_books: number;
  auditor_name: string | null;
  auditor_colegiado_number: string | null;
  auditor_signature_date: string | null;
}

export interface AdjustmentRecord {
  id?: number;
  reconciliation_id: number;
  enterprise_id: number;
  adjustment_type: 'cheque_no_cobrado' | 'deposito_en_transito' | 'nota_debito_banco' | 'nota_credito_banco' | 'error_banco' | 'error_libros' | 'otro';
  affects_side: 'banco' | 'libros';
  description: string;
  amount: number;
  document_reference: string | null;
  adjustment_date: string | null;
}

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentRecord['adjustment_type'], string> = {
  cheque_no_cobrado: 'Cheque no cobrado',
  deposito_en_transito: 'Depósito en tránsito',
  nota_debito_banco: 'Nota de débito banco',
  nota_credito_banco: 'Nota de crédito banco',
  error_banco: 'Error del banco',
  error_libros: 'Error en libros',
  otro: 'Otro',
};

export function useBankReconciliationQuadratic(reconciliationId: number | null) {
  const [data, setData] = useState<QuadraticData | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!reconciliationId) return;
    setLoading(true);
    try {
      const [quadResp, adjResp] = await Promise.all([
        supabase.from('tab_bank_reconciliation_quadratic' as never).select('*').eq('reconciliation_id', reconciliationId).maybeSingle(),
        supabase.from('tab_bank_reconciliation_adjustments' as never).select('*').eq('reconciliation_id', reconciliationId).order('id'),
      ]);
      if (quadResp.data) setData(quadResp.data as unknown as QuadraticData);
      else setData(null);
      setAdjustments(((adjResp.data as unknown as AdjustmentRecord[]) || []));
    } catch (err) {
      console.error('Error loading quadratic data', err);
    } finally {
      setLoading(false);
    }
  }, [reconciliationId]);

  useEffect(() => { load(); }, [load]);

  const save = async (input: Omit<QuadraticData, 'id'>) => {
    setLoading(true);
    try {
      if (data?.id) {
        const { error } = await supabase
          .from('tab_bank_reconciliation_quadratic' as never)
          .update(input as never)
          .eq('id', data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('tab_bank_reconciliation_quadratic' as never)
          .insert(input as never);
        if (error) throw error;
      }
      toast.success('Cuadrática guardada');
      await load();
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar la cuadrática');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const addAdjustment = async (adj: Omit<AdjustmentRecord, 'id'>) => {
    const { error } = await supabase.from('tab_bank_reconciliation_adjustments' as never).insert(adj as never);
    if (error) {
      toast.error('Error al agregar ajuste');
      return false;
    }
    await load();
    return true;
  };

  const deleteAdjustment = async (id: number) => {
    const { error } = await supabase.from('tab_bank_reconciliation_adjustments' as never).delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar ajuste');
      return false;
    }
    await load();
    return true;
  };

  return { data, adjustments, loading, save, addAdjustment, deleteAdjustment, reload: load };
}

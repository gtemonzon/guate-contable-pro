import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface PayrollPeriod {
  id: number;
  enterprise_id: number;
  period_year: number;
  period_month: number;
  payment_date: string;
  status: 'draft' | 'imported' | 'posted' | 'reversed';
  journal_entry_id: number | null;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  notes: string | null;
}

export interface PayrollEntry {
  id?: number;
  payroll_period_id: number;
  enterprise_id: number;
  employee_dpi: string | null;
  employee_name: string;
  employee_position: string | null;
  base_salary: number;
  bonificacion_decreto: number;
  overtime: number;
  commissions: number;
  other_income: number;
  igss_laboral: number;
  isr_retained: number;
  loans_deduction: number;
  other_deductions: number;
  net_pay: number;
}

export function usePayrollPeriods(enterpriseId: number | null) {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enterpriseId) return;
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from('tab_payroll_periods')
        .select('*')
        .eq('enterprise_id', enterpriseId)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false });
      if (error) throw error;
      setPeriods((data as PayrollPeriod[]) || []);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar períodos de nómina');
    } finally {
      setLoading(false);
    }
  }, [enterpriseId]);

  useEffect(() => { load(); }, [load]);

  const createPeriod = async (year: number, month: number, paymentDate: string) => {
    if (!enterpriseId) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data, error } = await sb
      .from('tab_payroll_periods')
      .insert({ enterprise_id: enterpriseId, period_year: year, period_month: month, payment_date: paymentDate, status: 'draft' })
      .select()
      .single();
    if (error) {
      toast.error(error.code === '23505' ? 'Ya existe nómina para ese mes' : 'Error al crear período');
      return null;
    }
    toast.success('Período de nómina creado');
    await load();
    return data as PayrollPeriod;
  };

  const deletePeriod = async (id: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { error } = await sb.from('tab_payroll_periods').delete().eq('id', id);
    if (error) {
      toast.error('Solo se pueden eliminar nóminas en borrador');
      return;
    }
    toast.success('Período eliminado');
    await load();
  };

  return { periods, loading, createPeriod, deletePeriod, reload: load };
}

export function usePayrollEntries(periodId: number | null) {
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!periodId) return;
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from('tab_payroll_entries')
        .select('*')
        .eq('payroll_period_id', periodId)
        .order('employee_name');
      if (error) throw error;
      setEntries((data as PayrollEntry[]) || []);
    } finally {
      setLoading(false);
    }
  }, [periodId]);

  useEffect(() => { load(); }, [load]);

  const replaceEntries = async (periodId: number, enterpriseId: number, newEntries: Omit<PayrollEntry, 'id' | 'payroll_period_id' | 'enterprise_id'>[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await sb.from('tab_payroll_entries').delete().eq('payroll_period_id', periodId);

    const rows = newEntries.map((e) => ({
      ...e,
      payroll_period_id: periodId,
      enterprise_id: enterpriseId,
    }));
    if (rows.length > 0) {
      const { error } = await sb.from('tab_payroll_entries').insert(rows);
      if (error) {
        toast.error('Error al guardar empleados');
        return false;
      }
    }

    // Recalcular totales del período
    const totalGross = rows.reduce((s, r) => s + r.base_salary + r.bonificacion_decreto + r.overtime + r.commissions + r.other_income, 0);
    const totalDeductions = rows.reduce((s, r) => s + r.igss_laboral + r.isr_retained + r.loans_deduction + r.other_deductions, 0);
    const totalNet = rows.reduce((s, r) => s + r.net_pay, 0);

    await sb.from('tab_payroll_periods').update({
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      status: 'imported',
    }).eq('id', periodId);

    toast.success(`${rows.length} empleados guardados`);
    await load();
    return true;
  };

  return { entries, loading, replaceEntries, reload: load };
}

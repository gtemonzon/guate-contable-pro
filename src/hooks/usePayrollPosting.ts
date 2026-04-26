import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { PayrollPeriod, PayrollEntry } from './usePayrollPeriods';

// Tasas estándar Guatemala
export const GT_PAYROLL_RATES = {
  igss_patronal: 0.1267,
  indemnizacion: 0.0972,
  aguinaldo: 0.0833,
  bono14: 0.0833,
  vacaciones: 0.0417,
};

interface Config {
  payroll_salaries_expense_account_id: number | null;
  payroll_bonificacion_expense_account_id: number | null;
  payroll_igss_patronal_expense_account_id: number | null;
  payroll_indemnizacion_expense_account_id: number | null;
  payroll_aguinaldo_expense_account_id: number | null;
  payroll_bono14_expense_account_id: number | null;
  payroll_vacaciones_expense_account_id: number | null;
  payroll_igss_payable_account_id: number | null;
  payroll_isr_payable_account_id: number | null;
  payroll_salaries_payable_account_id: number | null;
  payroll_indemnizacion_provision_account_id: number | null;
  payroll_aguinaldo_bono14_provision_account_id: number | null;
}

export interface PostingLine {
  account_id: number;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

export interface PayrollPostingOptions {
  includeVacaciones?: boolean;
}

export function calculatePayrollPosting(
  entries: PayrollEntry[],
  config: Config,
  options: PayrollPostingOptions = {},
): { lines: PostingLine[]; warnings: string[] } {
  const { includeVacaciones = false } = options;
  const warnings: string[] = [];
  const lines: PostingLine[] = [];

  const totalBase = entries.reduce((s, e) => s + e.base_salary, 0);
  const totalBoni = entries.reduce((s, e) => s + e.bonificacion_decreto + e.overtime + e.commissions + e.other_income, 0);
  const totalIgss = entries.reduce((s, e) => s + e.igss_laboral, 0);
  const totalIsr = entries.reduce((s, e) => s + e.isr_retained, 0);
  const totalOtherDed = entries.reduce((s, e) => s + e.loans_deduction + e.other_deductions, 0);
  const totalNet = entries.reduce((s, e) => s + e.net_pay, 0);

  const igssPat = totalBase * GT_PAYROLL_RATES.igss_patronal;
  const indem = totalBase * GT_PAYROLL_RATES.indemnizacion;
  const agui = totalBase * GT_PAYROLL_RATES.aguinaldo;
  const bono14 = totalBase * GT_PAYROLL_RATES.bono14;
  const vac = includeVacaciones ? totalBase * GT_PAYROLL_RATES.vacaciones : 0;

  const required: { key: keyof Config; label: string; debit: number }[] = [
    { key: 'payroll_salaries_expense_account_id', label: 'Sueldos', debit: totalBase },
    { key: 'payroll_bonificacion_expense_account_id', label: 'Bonificación/extras', debit: totalBoni },
    { key: 'payroll_igss_patronal_expense_account_id', label: 'IGSS patronal', debit: igssPat },
    { key: 'payroll_indemnizacion_expense_account_id', label: 'Indemnización', debit: indem },
    { key: 'payroll_aguinaldo_expense_account_id', label: 'Aguinaldo', debit: agui },
    { key: 'payroll_bono14_expense_account_id', label: 'Bono 14', debit: bono14 },
    { key: 'payroll_vacaciones_expense_account_id', label: 'Vacaciones', debit: vac },
  ];

  for (const r of required) {
    if (r.debit > 0) {
      if (!config[r.key]) warnings.push(`Falta cuenta de gasto: ${r.label}`);
      else lines.push({ account_id: config[r.key]!, description: r.label, debit_amount: Number(r.debit.toFixed(2)), credit_amount: 0 });
    }
  }

  // Créditos
  const credits: { key: keyof Config; label: string; amount: number }[] = [
    { key: 'payroll_igss_payable_account_id', label: 'IGSS por pagar (laboral + patronal)', amount: totalIgss + igssPat },
    { key: 'payroll_isr_payable_account_id', label: 'ISR retenido por pagar', amount: totalIsr },
    { key: 'payroll_salaries_payable_account_id', label: 'Sueldos por pagar (líquido + otros desc.)', amount: totalNet + totalOtherDed },
    { key: 'payroll_indemnizacion_provision_account_id', label: 'Provisión indemnización', amount: indem },
    { key: 'payroll_aguinaldo_bono14_provision_account_id', label: includeVacaciones ? 'Provisión aguinaldo + bono 14 + vacaciones' : 'Provisión aguinaldo + bono 14', amount: agui + bono14 + vac },
  ];

  for (const c of credits) {
    if (c.amount > 0) {
      if (!config[c.key]) warnings.push(`Falta cuenta por pagar/provisión: ${c.label}`);
      else lines.push({ account_id: config[c.key]!, description: c.label, debit_amount: 0, credit_amount: Number(c.amount.toFixed(2)) });
    }
  }

  return { lines, warnings };
}

export async function postPayroll(period: PayrollPeriod, entries: PayrollEntry[], config: Config, options: PayrollPostingOptions = {}): Promise<boolean> {
  const { lines, warnings } = calculatePayrollPosting(entries, config, options);
  if (warnings.length > 0) {
    toast.error(`Configura las cuentas faltantes: ${warnings.join(', ')}`);
    return false;
  }

  const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    toast.error(`Partida descuadrada: D=${totalDebit.toFixed(2)} C=${totalCredit.toFixed(2)}`);
    return false;
  }

  try {
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) throw new Error('No auth');

    // Buscar período contable que contiene la fecha de pago
    const { data: periodRow } = await supabase
      .from('tab_accounting_periods')
      .select('id')
      .eq('enterprise_id', period.enterprise_id)
      .lte('start_date', period.payment_date)
      .gte('end_date', period.payment_date)
      .maybeSingle();

    // Reservar número (tipo='ajuste' como base y usaremos description con marca NOMINA)
    const { data: numData, error: numErr } = await supabase.rpc('allocate_journal_entry_number', {
      p_enterprise_id: period.enterprise_id,
      p_entry_type: 'ajuste',
      p_entry_date: period.payment_date,
    });
    if (numErr) throw numErr;
    const entryNumber = numData as string;

    const totalDebitAmt = lines.reduce((s, l) => s + l.debit_amount, 0);

    // Header (siguiendo patrón de useJournalEntryForm)
     
    const { data: header, error: hErr } = await supabase.from('tab_journal_entries').insert({
      enterprise_id: period.enterprise_id,
      entry_number: entryNumber,
      entry_date: period.payment_date,
      entry_type: 'ajuste',
      accounting_period_id: periodRow?.id || null,
      description: `[NÓMINA] Provisión nómina ${String(period.period_month).padStart(2, '0')}/${period.period_year}`,
      total_debit: totalDebitAmt,
      total_credit: totalDebitAmt,
      is_posted: false,
      status: 'borrador',
      currency_code: 'GTQ',
      exchange_rate: 1,
      created_by: userResp.user.id,
    } as any).select().single();
    if (hErr) throw hErr;

    // Lines con line_number
    const lineRows = lines.map((l, i) => ({
      journal_entry_id: header.id,
      line_number: i + 1,
      account_id: l.account_id,
      description: l.description,
      debit_amount: l.debit_amount,
      credit_amount: l.credit_amount,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: lErr } = await supabase.from('tab_journal_entry_details').insert(lineRows as any);
    if (lErr) throw lErr;

    // Posted
    const { error: pErr } = await supabase
      .from('tab_journal_entries')
      .update({ is_posted: true, status: 'publicada' })
      .eq('id', header.id);
    if (pErr) throw pErr;

    // Update payroll period
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    await sb.from('tab_payroll_periods').update({ status: 'posted', journal_entry_id: header.id }).eq('id', period.id);

    toast.success(`Póliza ${entryNumber} creada y publicada`);
    return true;
  } catch (err) {
    console.error(err);
    toast.error(`Error al contabilizar: ${(err as Error).message}`);
    return false;
  }
}

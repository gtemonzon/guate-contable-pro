import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRecords } from '@/utils/supabaseHelpers';

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationResult {
  code: string;
  severity: ValidationSeverity;
  category: string;
  message: string;
  details: string;
  affectedRecords: { id: number; label: string }[];
}

export interface ValidationSummary {
  totalErrors: number;
  totalWarnings: number;
  totalInfo: number;
  healthScore: number;
  results: ValidationResult[];
  runAt: string;
  categories: Record<string, { errors: number; warnings: number; info: number; results: ValidationResult[] }>;
}

interface CategoryProgress {
  label: string;
  status: string;
}

const TOLERANCE = 0.01;

export function useAccountingIntegrity() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<CategoryProgress[]>([]);
  const [summary, setSummary] = useState<ValidationSummary | null>(null);

  const runValidation = useCallback(async (enterpriseId: number, periodId?: number | null) => {
    setIsRunning(true);
    const results: ValidationResult[] = [];

    const categories = [
      { id: 'A', label: 'Integridad de Partidas' },
      { id: 'B', label: 'Integridad de Cuentas' },
      { id: 'C', label: 'Integridad de Períodos' },
      { id: 'D', label: 'Integridad Fiscal' },
      { id: 'E', label: 'Conciliación Bancaria' },
      { id: 'F', label: 'Balance Contable' },
    ];

    const progressState: CategoryProgress[] = categories.map(c => ({ label: c.label, status: 'pending' }));
    setProgress([...progressState]);

    try {
      // === CATEGORY A: Journal Entry Integrity ===
      progressState[0].status = 'running';
      setProgress([...progressState]);

      let entriesQuery = supabase
        .from('tab_journal_entries')
        .select('id, entry_number, entry_date, total_debit, total_credit, status, accounting_period_id, description')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null);
      
      if (periodId) {
        entriesQuery = entriesQuery.eq('accounting_period_id', periodId);
      }

      const entries = await fetchAllRecords<any>(entriesQuery);

      if (entries.length > 0) {
        const entryIds = entries.map((e: any) => e.id);
        
        // Fetch all details in batches
        const allDetails: any[] = [];
        for (let i = 0; i < entryIds.length; i += 500) {
          const batch = entryIds.slice(i, i + 500);
          const { data } = await supabase
            .from('tab_journal_entry_details')
            .select('id, journal_entry_id, debit_amount, credit_amount, account_id, line_number')
            .in('journal_entry_id', batch)
            .is('deleted_at', null);
          if (data) allDetails.push(...data);
        }

        const detailsByEntry = new Map<number, any[]>();
        allDetails.forEach(d => {
          if (!detailsByEntry.has(d.journal_entry_id)) detailsByEntry.set(d.journal_entry_id, []);
          detailsByEntry.get(d.journal_entry_id)!.push(d);
        });

        for (const entry of entries) {
          const details = detailsByEntry.get(entry.id) || [];

          // A2: Empty entries
          if (details.length === 0) {
            results.push({
              code: 'A2', severity: 'ERROR', category: 'A',
              message: `Partida ${entry.entry_number} sin líneas de detalle`,
              details: `La partida ${entry.entry_number} (${entry.entry_date}) no tiene líneas de detalle.`,
              affectedRecords: [{ id: entry.id, label: entry.entry_number }],
            });
            continue;
          }

          // A3: Single-line entries
          if (details.length === 1) {
            results.push({
              code: 'A3', severity: 'ERROR', category: 'A',
              message: `Partida ${entry.entry_number} con solo 1 línea`,
              details: 'Una partida contable debe tener al menos 2 líneas (partida doble).',
              affectedRecords: [{ id: entry.id, label: entry.entry_number }],
            });
          }

          // A1: Balanced check
          const totalDebits = details.reduce((s: number, d: any) => s + Number(d.debit_amount || 0), 0);
          const totalCredits = details.reduce((s: number, d: any) => s + Number(d.credit_amount || 0), 0);
          const diff = Math.abs(totalDebits - totalCredits);
          if (diff > TOLERANCE) {
            results.push({
              code: 'A1', severity: 'ERROR', category: 'A',
              message: `Partida ${entry.entry_number} desbalanceada (diff: Q${diff.toFixed(2)})`,
              details: `Débitos: Q${totalDebits.toFixed(2)}, Créditos: Q${totalCredits.toFixed(2)}.`,
              affectedRecords: [{ id: entry.id, label: entry.entry_number }],
            });
          }

          // A4, A5, A6: Detail-level checks
          for (const det of details) {
            const debit = Number(det.debit_amount || 0);
            const credit = Number(det.credit_amount || 0);

            if (debit === 0 && credit === 0) {
              results.push({
                code: 'A4', severity: 'WARNING', category: 'A',
                message: `Línea ${det.line_number} de ${entry.entry_number} con monto cero`,
                details: 'Tanto el débito como el crédito son 0.',
                affectedRecords: [{ id: entry.id, label: entry.entry_number }],
              });
            }
            if (debit > 0 && credit > 0) {
              results.push({
                code: 'A5', severity: 'ERROR', category: 'A',
                message: `Línea ${det.line_number} de ${entry.entry_number} con débito Y crédito`,
                details: `Débito: Q${debit.toFixed(2)}, Crédito: Q${credit.toFixed(2)}. Una línea debe tener solo uno.`,
                affectedRecords: [{ id: entry.id, label: entry.entry_number }],
              });
            }
            if (debit < 0 || credit < 0) {
              results.push({
                code: 'A6', severity: 'ERROR', category: 'A',
                message: `Línea ${det.line_number} de ${entry.entry_number} con monto negativo`,
                details: `Débito: Q${debit.toFixed(2)}, Crédito: Q${credit.toFixed(2)}.`,
                affectedRecords: [{ id: entry.id, label: entry.entry_number }],
              });
            }
          }
        }

        // A8: Duplicate entry numbers
        const entryNumberMap = new Map<string, any[]>();
        entries.forEach((e: any) => {
          const key = `${e.accounting_period_id}-${e.entry_number}`;
          if (!entryNumberMap.has(key)) entryNumberMap.set(key, []);
          entryNumberMap.get(key)!.push(e);
        });
        entryNumberMap.forEach((group, key) => {
          if (group.length > 1) {
            results.push({
              code: 'A8', severity: 'WARNING', category: 'A',
              message: `Número de partida duplicado: ${group[0].entry_number}`,
              details: `${group.length} partidas con el mismo número en el mismo período.`,
              affectedRecords: group.map((e: any) => ({ id: e.id, label: e.entry_number })),
            });
          }
        });
      }

      progressState[0].status = 'done';

      // === CATEGORY B: Account Integrity ===
      progressState[1].status = 'running';
      setProgress([...progressState]);

      const accountsQuery = supabase
        .from('tab_accounts')
        .select('id, account_code, account_name, account_type, is_active, parent_account_id, allows_movement')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null);
      const accounts = await fetchAllRecords<any>(accountsQuery);

      if (accounts.length > 0) {
        const accountMap = new Map(accounts.map((a: any) => [a.id, a]));

        // B2: Inactive accounts with movements
        const inactiveAccounts = accounts.filter((a: any) => !a.is_active);
        if (inactiveAccounts.length > 0) {
          const inactiveIds = inactiveAccounts.map((a: any) => a.id);
          // Check if they have any details
          for (let i = 0; i < inactiveIds.length; i += 500) {
            const batch = inactiveIds.slice(i, i + 500);
            const { data: usedDetails } = await supabase
              .from('tab_journal_entry_details')
              .select('account_id')
              .in('account_id', batch)
              .is('deleted_at', null)
              .limit(1);
            
            if (usedDetails && usedDetails.length > 0) {
              const usedIds = new Set(usedDetails.map(d => d.account_id));
              inactiveAccounts.filter((a: any) => usedIds.has(a.id)).forEach((a: any) => {
                results.push({
                  code: 'B2', severity: 'WARNING', category: 'B',
                  message: `Cuenta inactiva ${a.account_code} tiene movimientos`,
                  details: `${a.account_name} está marcada como inactiva pero tiene movimientos registrados.`,
                  affectedRecords: [{ id: a.id, label: a.account_code }],
                });
              });
            }
          }
        }
      }

      progressState[1].status = 'done';

      // === CATEGORY C: Period Integrity ===
      progressState[2].status = 'running';
      setProgress([...progressState]);

      const periodsQuery = supabase
        .from('tab_accounting_periods')
        .select('id, year, start_date, end_date, status')
        .eq('enterprise_id', enterpriseId)
        .order('start_date');
      const periods = await fetchAllRecords<any>(periodsQuery);

      if (periods.length > 1) {
        for (let i = 1; i < periods.length; i++) {
          const prev = periods[i - 1];
          const curr = periods[i];
          const prevEnd = new Date(prev.end_date);
          const currStart = new Date(curr.start_date);

          // C1: Overlapping
          if (currStart <= prevEnd) {
            results.push({
              code: 'C1', severity: 'ERROR', category: 'C',
              message: `Períodos ${prev.year} y ${curr.year} se traslapan`,
              details: `${prev.end_date} >= ${curr.start_date}.`,
              affectedRecords: [
                { id: prev.id, label: `Período ${prev.year}` },
                { id: curr.id, label: `Período ${curr.year}` },
              ],
            });
          }

          // C2: Gaps
          const dayAfterPrev = new Date(prevEnd);
          dayAfterPrev.setDate(dayAfterPrev.getDate() + 1);
          if (currStart > dayAfterPrev) {
            results.push({
              code: 'C2', severity: 'WARNING', category: 'C',
              message: `Brecha entre períodos ${prev.year} y ${curr.year}`,
              details: `No hay cobertura entre ${prev.end_date} y ${curr.start_date}.`,
              affectedRecords: [
                { id: prev.id, label: `Período ${prev.year}` },
                { id: curr.id, label: `Período ${curr.year}` },
              ],
            });
          }
        }
      }

      // A7: Entry date vs period (moved here since we need periods)
      if (entries.length > 0 && periods.length > 0) {
        const periodMap = new Map(periods.map((p: any) => [p.id, p]));
        for (const entry of entries) {
          if (entry.accounting_period_id) {
            const period = periodMap.get(entry.accounting_period_id);
            if (period) {
              const entryDate = entry.entry_date;
              if (entryDate < period.start_date || entryDate > period.end_date) {
                results.push({
                  code: 'A7', severity: 'ERROR', category: 'A',
                  message: `Partida ${entry.entry_number} fuera de su período`,
                  details: `Fecha ${entryDate} fuera del rango ${period.start_date} a ${period.end_date}.`,
                  affectedRecords: [{ id: entry.id, label: entry.entry_number }],
                });
              }
            }
          }
        }
      }

      progressState[2].status = 'done';

      // === CATEGORY D: Fiscal Ledger Integrity ===
      progressState[3].status = 'running';
      setProgress([...progressState]);

      // D4: Duplicate purchase invoices
      const purchasesQuery = supabase
        .from('tab_purchase_ledger')
        .select('id, supplier_nit, invoice_number, invoice_date, vat_amount, net_amount, total_amount')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null);
      const purchases = await fetchAllRecords<any>(purchasesQuery);

      if (purchases.length > 0) {
        const purchaseKey = new Map<string, any[]>();
        purchases.forEach((p: any) => {
          const key = `${p.supplier_nit}-${p.invoice_number}`;
          if (!purchaseKey.has(key)) purchaseKey.set(key, []);
          purchaseKey.get(key)!.push(p);
        });
        purchaseKey.forEach((group) => {
          if (group.length > 1) {
            results.push({
              code: 'D4', severity: 'WARNING', category: 'D',
              message: `Factura duplicada: ${group[0].supplier_nit} / ${group[0].invoice_number}`,
              details: `${group.length} registros con la misma combinación proveedor-factura.`,
              affectedRecords: group.map((p: any) => ({ id: p.id, label: `${p.supplier_nit}-${p.invoice_number}` })),
            });
          }
        });

        // D3: IVA calculation check
        for (const p of purchases) {
          const expectedIva = Number(p.total_amount) / 1.12 * 0.12;
          const actualIva = Number(p.vat_amount);
          if (Math.abs(expectedIva - actualIva) > 1) { // 1 GTQ tolerance for rounding
            results.push({
              code: 'D3', severity: 'WARNING', category: 'D',
              message: `IVA irregular en factura ${p.invoice_number}`,
              details: `IVA registrado: Q${actualIva.toFixed(2)}, esperado ~Q${expectedIva.toFixed(2)}.`,
              affectedRecords: [{ id: p.id, label: p.invoice_number }],
            });
          }
        }
      }

      progressState[3].status = 'done';

      // === CATEGORY E: Bank Reconciliation ===
      progressState[4].status = 'running';
      setProgress([...progressState]);
      // Basic check
      progressState[4].status = 'done';

      // === CATEGORY F: Balance Integrity ===
      progressState[5].status = 'running';
      setProgress([...progressState]);

      // F2: Trial balance check
      if (accounts.length > 0 && entries.length > 0) {
        // We already have allDetails from Category A
        const entryIds = entries.map((e: any) => e.id);
        const allDetailsForBalance: any[] = [];
        for (let i = 0; i < entryIds.length; i += 500) {
          const batch = entryIds.slice(i, i + 500);
          const { data } = await supabase
            .from('tab_journal_entry_details')
            .select('debit_amount, credit_amount')
            .in('journal_entry_id', batch)
            .is('deleted_at', null);
          if (data) allDetailsForBalance.push(...data);
        }

        const totalDebits = allDetailsForBalance.reduce((s, d) => s + Number(d.debit_amount || 0), 0);
        const totalCredits = allDetailsForBalance.reduce((s, d) => s + Number(d.credit_amount || 0), 0);
        const balanceDiff = Math.abs(totalDebits - totalCredits);

        if (balanceDiff > TOLERANCE) {
          results.push({
            code: 'F2', severity: 'ERROR', category: 'F',
            message: `Balance de comprobación descuadrado (diff: Q${balanceDiff.toFixed(2)})`,
            details: `Total débitos: Q${totalDebits.toFixed(2)}, Total créditos: Q${totalCredits.toFixed(2)}.`,
            affectedRecords: [],
          });
        }
      }

      progressState[5].status = 'done';
      setProgress([...progressState]);

      // Build summary
      const totalErrors = results.filter(r => r.severity === 'ERROR').length;
      const totalWarnings = results.filter(r => r.severity === 'WARNING').length;
      const totalInfo = results.filter(r => r.severity === 'INFO').length;
      const totalRules = Math.max(results.length, 1);
      const healthScore = Math.max(0, ((totalRules - totalErrors - totalWarnings * 0.5) / totalRules) * 100);

      const categorized: Record<string, { errors: number; warnings: number; info: number; results: ValidationResult[] }> = {};
      categories.forEach(c => {
        const catResults = results.filter(r => r.category === c.id);
        categorized[c.id] = {
          errors: catResults.filter(r => r.severity === 'ERROR').length,
          warnings: catResults.filter(r => r.severity === 'WARNING').length,
          info: catResults.filter(r => r.severity === 'INFO').length,
          results: catResults,
        };
      });

      const validationSummary: ValidationSummary = {
        totalErrors,
        totalWarnings,
        totalInfo,
        healthScore: results.length === 0 ? 100 : healthScore,
        results,
        runAt: new Date().toISOString(),
        categories: categorized,
      };

      setSummary(validationSummary);

      // Save to DB
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('tab_integrity_validations').insert({
          enterprise_id: enterpriseId,
          period_id: periodId || null,
          run_by: user.id,
          total_errors: totalErrors,
          total_warnings: totalWarnings,
          total_info: totalInfo,
          health_score: validationSummary.healthScore,
          results: results as any,
        });
      }

      return validationSummary;
    } catch (error) {
      console.error('Validation error:', error);
      throw error;
    } finally {
      setIsRunning(false);
    }
  }, []);

  return {
    runValidation,
    isRunning,
    progress,
    summary,
    setSummary,
  };
}

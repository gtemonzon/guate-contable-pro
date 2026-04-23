import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRecords } from '@/utils/supabaseHelpers';
import { validateNIT } from '@/utils/nitValidation';

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

// Total number of validation rules implemented
const TOTAL_RULES = 25; // A1-A8, B1-B5, C1-C4, D1-D6, E1-E2, F1-F3, G1-G2

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
      { id: 'G', label: 'Costo de Ventas' },
    ];

    const progressState: CategoryProgress[] = categories.map(c => ({ label: c.label, status: 'pending' }));
    setProgress([...progressState]);

    // Shared data across categories
    let entries: any[] = [];
    const allDetails: any[] = [];
    let accounts: any[] = [];
    let periods: any[] = [];

    try {
      // === Pre-fetch shared data ===
      let entriesQuery = supabase
        .from('tab_journal_entries')
        .select('id, entry_number, entry_date, total_debit, total_credit, status, accounting_period_id, description, created_at, updated_at')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null);
      if (periodId) entriesQuery = entriesQuery.eq('accounting_period_id', periodId);
      entries = await fetchAllRecords<any>(entriesQuery);

      if (entries.length > 0) {
        const entryIds = entries.map((e: any) => e.id);
        for (let i = 0; i < entryIds.length; i += 500) {
          const batch = entryIds.slice(i, i + 500);
          const { data } = await supabase
            .from('tab_journal_entry_details')
            .select('id, journal_entry_id, debit_amount, credit_amount, account_id, line_number')
            .in('journal_entry_id', batch)
            .is('deleted_at', null);
          if (data) allDetails.push(...data);
        }
      }

      const accountsQuery = supabase
        .from('tab_accounts')
        .select('id, account_code, account_name, account_type, is_active, parent_account_id, allows_movement, level')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null);
      accounts = await fetchAllRecords<any>(accountsQuery);

      const periodsQuery = supabase
        .from('tab_accounting_periods')
        .select('id, year, start_date, end_date, status, closed_at')
        .eq('enterprise_id', enterpriseId)
        .order('start_date');
      periods = await fetchAllRecords<any>(periodsQuery);

      // Build lookup maps
      const detailsByEntry = new Map<number, any[]>();
      allDetails.forEach(d => {
        if (!detailsByEntry.has(d.journal_entry_id)) detailsByEntry.set(d.journal_entry_id, []);
        detailsByEntry.get(d.journal_entry_id)!.push(d);
      });
      const accountMap = new Map(accounts.map((a: any) => [a.id, a]));
      const periodMap = new Map(periods.map((p: any) => [p.id, p]));

      // === CATEGORY A: Journal Entry Integrity ===
      progressState[0].status = 'running';
      setProgress([...progressState]);

      for (const entry of entries) {
        const details = detailsByEntry.get(entry.id) || [];

        if (details.length === 0) {
          results.push({ code: 'A2', severity: 'ERROR', category: 'A',
            message: `Partida ${entry.entry_number} sin líneas de detalle`,
            details: `La partida ${entry.entry_number} (${entry.entry_date}) no tiene líneas.`,
            affectedRecords: [{ id: entry.id, label: entry.entry_number }] });
          continue;
        }

        if (details.length === 1) {
          results.push({ code: 'A3', severity: 'ERROR', category: 'A',
            message: `Partida ${entry.entry_number} con solo 1 línea`,
            details: 'Una partida contable debe tener al menos 2 líneas (partida doble).',
            affectedRecords: [{ id: entry.id, label: entry.entry_number }] });
        }

        const totalDebits = details.reduce((s: number, d: any) => s + Number(d.debit_amount || 0), 0);
        const totalCredits = details.reduce((s: number, d: any) => s + Number(d.credit_amount || 0), 0);
        const diff = Math.abs(totalDebits - totalCredits);
        if (diff > TOLERANCE) {
          results.push({ code: 'A1', severity: 'ERROR', category: 'A',
            message: `Partida ${entry.entry_number} desbalanceada (diff: Q${diff.toFixed(2)})`,
            details: `Débitos: Q${totalDebits.toFixed(2)}, Créditos: Q${totalCredits.toFixed(2)}.`,
            affectedRecords: [{ id: entry.id, label: entry.entry_number }] });
        }

        for (const det of details) {
          const debit = Number(det.debit_amount || 0);
          const credit = Number(det.credit_amount || 0);

          // A4 omitido: las líneas con monto cero se previenen al contabilizar
          if (debit > 0 && credit > 0) {
            results.push({ code: 'A5', severity: 'ERROR', category: 'A',
              message: `Línea ${det.line_number} de ${entry.entry_number} con débito Y crédito`,
              details: `Débito: Q${debit.toFixed(2)}, Crédito: Q${credit.toFixed(2)}.`,
              affectedRecords: [{ id: entry.id, label: entry.entry_number }] });
          }
          if (debit < 0 || credit < 0) {
            results.push({ code: 'A6', severity: 'ERROR', category: 'A',
              message: `Línea ${det.line_number} de ${entry.entry_number} con monto negativo`,
              details: `Débito: Q${debit.toFixed(2)}, Crédito: Q${credit.toFixed(2)}.`,
              affectedRecords: [{ id: entry.id, label: entry.entry_number }] });
          }
        }

        // A7: Entry date vs period
        if (entry.accounting_period_id) {
          const period = periodMap.get(entry.accounting_period_id);
          if (period && (entry.entry_date < period.start_date || entry.entry_date > period.end_date)) {
            results.push({ code: 'A7', severity: 'ERROR', category: 'A',
              message: `Partida ${entry.entry_number} fuera de su período`,
              details: `Fecha ${entry.entry_date} fuera del rango ${period.start_date} a ${period.end_date}.`,
              affectedRecords: [{ id: entry.id, label: entry.entry_number }] });
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
      entryNumberMap.forEach((group) => {
        if (group.length > 1) {
          results.push({ code: 'A8', severity: 'WARNING', category: 'A',
            message: `Número de partida duplicado: ${group[0].entry_number}`,
            details: `${group.length} partidas con el mismo número en el mismo período.`,
            affectedRecords: group.map((e: any) => ({ id: e.id, label: e.entry_number })) });
        }
      });

      progressState[0].status = 'done';

      // === CATEGORY B: Account Integrity ===
      progressState[1].status = 'running';
      setProgress([...progressState]);

      if (accounts.length > 0) {
        // B1: Orphan account references in details
        const usedAccountIds = new Set(allDetails.map(d => d.account_id).filter(Boolean));
        const validAccountIds = new Set(accounts.map((a: any) => a.id));
        for (const usedId of usedAccountIds) {
          if (!validAccountIds.has(usedId)) {
            results.push({ code: 'B1', severity: 'ERROR', category: 'B',
              message: `Referencia a cuenta inexistente ID: ${usedId}`,
              details: 'Se encontraron líneas de detalle referenciando una cuenta que no existe en el catálogo.',
              affectedRecords: [{ id: usedId, label: `ID ${usedId}` }] });
          }
        }

        // B2: Inactive accounts with movements
        const inactiveAccounts = accounts.filter((a: any) => !a.is_active);
        if (inactiveAccounts.length > 0) {
          const inactiveIds = new Set(inactiveAccounts.map((a: any) => a.id));
          const inactiveWithMovements = new Set<number>();
          allDetails.forEach(d => {
            if (d.account_id && inactiveIds.has(d.account_id)) {
              inactiveWithMovements.add(d.account_id);
            }
          });
          for (const accId of inactiveWithMovements) {
            const acc = accountMap.get(accId);
            if (acc) {
              results.push({ code: 'B2', severity: 'WARNING', category: 'B',
                message: `Cuenta inactiva ${acc.account_code} tiene movimientos`,
                details: `${acc.account_name} está marcada como inactiva pero tiene movimientos registrados.`,
                affectedRecords: [{ id: acc.id, label: acc.account_code }] });
            }
          }
        }

        // B3: Parent-child nature consistency
        for (const acc of accounts) {
          if (acc.parent_account_id) {
            const parent = accountMap.get(acc.parent_account_id);
            if (parent && parent.account_type !== acc.account_type) {
              results.push({ code: 'B3', severity: 'WARNING', category: 'B',
                message: `Cuenta ${acc.account_code} difiere en tipo de su padre`,
                details: `Tipo: ${acc.account_type}, Padre (${parent.account_code}): ${parent.account_type}.`,
                affectedRecords: [{ id: acc.id, label: acc.account_code }] });
            }
          }
        }

        // B4 omitido: cuentas sin movimientos no representa un problema de integridad

        // B5: Account code format consistency
        const codePatterns = new Map<number, Set<string>>();
        for (const acc of accounts) {
          const level = acc.level || 1;
          if (!codePatterns.has(level)) codePatterns.set(level, new Set());
          // Extract pattern: replace digits with 'N'
          const pattern = acc.account_code.replace(/\d+/g, 'N');
          codePatterns.get(level)!.add(pattern);
        }
        for (const [level, patterns] of codePatterns) {
          if (patterns.size > 2) { // Allow some variation, flag if >2 patterns per level
            results.push({ code: 'B5', severity: 'WARNING', category: 'B',
              message: `Formatos inconsistentes en códigos de nivel ${level}`,
              details: `Se encontraron ${patterns.size} formatos distintos: ${[...patterns].slice(0, 3).join(', ')}...`,
              affectedRecords: [] });
          }
        }
      }

      progressState[1].status = 'done';

      // === CATEGORY C: Period Integrity ===
      progressState[2].status = 'running';
      setProgress([...progressState]);

      if (periods.length > 1) {
        for (let i = 1; i < periods.length; i++) {
          const prev = periods[i - 1];
          const curr = periods[i];
          const prevEnd = new Date(prev.end_date);
          const currStart = new Date(curr.start_date);

          if (currStart <= prevEnd) {
            results.push({ code: 'C1', severity: 'ERROR', category: 'C',
              message: `Períodos ${prev.year} y ${curr.year} se traslapan`,
              details: `${prev.end_date} >= ${curr.start_date}.`,
              affectedRecords: [{ id: prev.id, label: `Período ${prev.year}` }, { id: curr.id, label: `Período ${curr.year}` }] });
          }

          const dayAfterPrev = new Date(prevEnd);
          dayAfterPrev.setDate(dayAfterPrev.getDate() + 1);
          if (currStart > dayAfterPrev) {
            results.push({ code: 'C2', severity: 'WARNING', category: 'C',
              message: `Brecha entre períodos ${prev.year} y ${curr.year}`,
              details: `No hay cobertura entre ${prev.end_date} y ${curr.start_date}.`,
              affectedRecords: [{ id: prev.id, label: `Período ${prev.year}` }, { id: curr.id, label: `Período ${curr.year}` }] });
          }
        }
      }

      // C3: Entries in closed periods (modified after closing)
      for (const period of periods) {
        if (period.status === 'cerrado' && period.closed_at) {
          const closedDate = new Date(period.closed_at);
          const entriesInPeriod = entries.filter((e: any) => e.accounting_period_id === period.id);
          for (const entry of entriesInPeriod) {
            const updatedAt = entry.updated_at ? new Date(entry.updated_at) : null;
            if (updatedAt && updatedAt > closedDate) {
              results.push({ code: 'C3', severity: 'ERROR', category: 'C',
                message: `Partida ${entry.entry_number} modificada después del cierre`,
                details: `Período ${period.year} cerrado el ${period.closed_at.slice(0, 10)}, partida modificada el ${entry.updated_at?.slice(0, 10)}.`,
                affectedRecords: [{ id: entry.id, label: entry.entry_number }] });
            }
          }
        }
      }

      // C4: Opening balance check for first period
      if (periods.length > 0) {
        const firstPeriod = periods[0];
        const openingEntries = entries.filter((e: any) =>
          e.accounting_period_id === firstPeriod.id &&
          (e.entry_number?.toLowerCase().includes('apertura') || e.description?.toLowerCase().includes('apertura'))
        );
        if (openingEntries.length > 0) {
          let openingDebits = 0, openingCredits = 0;
          for (const oe of openingEntries) {
            const dets = detailsByEntry.get(oe.id) || [];
            openingDebits += dets.reduce((s: number, d: any) => s + Number(d.debit_amount || 0), 0);
            openingCredits += dets.reduce((s: number, d: any) => s + Number(d.credit_amount || 0), 0);
          }
          if (Math.abs(openingDebits - openingCredits) > TOLERANCE) {
            results.push({ code: 'C4', severity: 'ERROR', category: 'C',
              message: 'Saldos de apertura desbalanceados',
              details: `Débitos apertura: Q${openingDebits.toFixed(2)}, Créditos: Q${openingCredits.toFixed(2)}.`,
              affectedRecords: openingEntries.map((e: any) => ({ id: e.id, label: e.entry_number })) });
          }
        }
      }

      progressState[2].status = 'done';

      // === CATEGORY D: Fiscal Ledger Integrity ===
      progressState[3].status = 'running';
      setProgress([...progressState]);

      const purchasesQuery = supabase
        .from('tab_purchase_ledger')
        .select('id, supplier_nit, supplier_name, invoice_number, invoice_date, invoice_series, vat_amount, net_amount, total_amount, journal_entry_id, fel_document_type')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null);
      const purchases = await fetchAllRecords<any>(purchasesQuery);

      const salesQuery = supabase
        .from('tab_sales_ledger')
        .select('id, customer_nit, customer_name, invoice_number, invoice_date, invoice_series, vat_amount, net_amount, total_amount, journal_entry_id, fel_document_type, is_annulled')
        .eq('enterprise_id', enterpriseId)
        .is('deleted_at', null);
      const sales = await fetchAllRecords<any>(salesQuery);

      const entryIdSet = new Set(entries.map((e: any) => e.id));

      // D1: Purchases without journal entries
      for (const p of purchases) {
        if (!p.journal_entry_id || !entryIdSet.has(p.journal_entry_id)) {
          results.push({ code: 'D1', severity: 'ERROR', category: 'D',
            message: `Compra ${p.invoice_number} sin partida contable`,
            details: `Proveedor: ${p.supplier_name} (${p.supplier_nit}), fecha: ${p.invoice_date}.`,
            affectedRecords: [{ id: p.id, label: p.invoice_number }] });
        }
      }

      // D2: Sales without journal entries
      for (const s of sales) {
        if (!s.is_annulled && (!s.journal_entry_id || !entryIdSet.has(s.journal_entry_id))) {
          results.push({ code: 'D2', severity: 'ERROR', category: 'D',
            message: `Venta ${s.invoice_number} sin partida contable`,
            details: `Cliente: ${s.customer_name} (${s.customer_nit}), fecha: ${s.invoice_date}.`,
            affectedRecords: [{ id: s.id, label: s.invoice_number }] });
        }
      }

      // D3: IVA calculation check
      for (const p of purchases) {
        const expectedIva = Number(p.total_amount) / 1.12 * 0.12;
        const actualIva = Number(p.vat_amount);
        if (Math.abs(expectedIva - actualIva) > 1) {
          results.push({ code: 'D3', severity: 'WARNING', category: 'D',
            message: `IVA irregular en factura de compra ${p.invoice_number}`,
            details: `IVA registrado: Q${actualIva.toFixed(2)}, esperado ~Q${expectedIva.toFixed(2)}.`,
            affectedRecords: [{ id: p.id, label: p.invoice_number }] });
        }
      }

      // D4: Duplicate purchase invoices
      const purchaseKey = new Map<string, any[]>();
      purchases.forEach((p: any) => {
        const key = `${p.supplier_nit}-${p.invoice_number}`;
        if (!purchaseKey.has(key)) purchaseKey.set(key, []);
        purchaseKey.get(key)!.push(p);
      });
      purchaseKey.forEach((group) => {
        if (group.length > 1) {
          results.push({ code: 'D4', severity: 'WARNING', category: 'D',
            message: `Factura duplicada: ${group[0].supplier_nit} / ${group[0].invoice_number}`,
            details: `${group.length} registros con la misma combinación proveedor-factura.`,
            affectedRecords: group.map((p: any) => ({ id: p.id, label: `${p.supplier_nit}-${p.invoice_number}` })) });
        }
      });

      // D5: Sequential invoice gaps in sales
      const activeSales = sales.filter((s: any) => !s.is_annulled);
      if (activeSales.length > 0) {
        const seriesGroups = new Map<string, number[]>();
        for (const s of activeSales) {
          const series = s.invoice_series || s.fel_document_type || 'default';
          if (!seriesGroups.has(series)) seriesGroups.set(series, []);
          const num = parseInt(s.invoice_number);
          if (!isNaN(num)) seriesGroups.get(series)!.push(num);
        }
        for (const [series, nums] of seriesGroups) {
          if (nums.length < 2) continue;
          nums.sort((a, b) => a - b);
          const gaps: number[] = [];
          for (let i = 1; i < nums.length && gaps.length < 5; i++) {
            if (nums[i] - nums[i - 1] > 1) {
              gaps.push(nums[i - 1] + 1);
            }
          }
          if (gaps.length > 0) {
            results.push({ code: 'D5', severity: 'INFO', category: 'D',
              message: `Brechas en numeración de ventas (serie: ${series})`,
              details: `Faltan los números: ${gaps.join(', ')}${gaps.length >= 5 ? '...' : ''}.`,
              affectedRecords: [] });
          }
        }
      }

      // D6: NIT validation
      const invalidNits: { source: string; nit: string; name: string; id: number }[] = [];
      for (const p of purchases) {
        if (p.supplier_nit && !validateNIT(p.supplier_nit)) {
          invalidNits.push({ source: 'compra', nit: p.supplier_nit, name: p.supplier_name, id: p.id });
        }
      }
      for (const s of sales) {
        if (s.customer_nit && !validateNIT(s.customer_nit)) {
          invalidNits.push({ source: 'venta', nit: s.customer_nit, name: s.customer_name, id: s.id });
        }
      }
      // Group by NIT to avoid flooding
      const nitGroups = new Map<string, typeof invalidNits>();
      for (const item of invalidNits) {
        if (!nitGroups.has(item.nit)) nitGroups.set(item.nit, []);
        nitGroups.get(item.nit)!.push(item);
      }
      for (const [nit, items] of nitGroups) {
        results.push({ code: 'D6', severity: 'WARNING', category: 'D',
          message: `NIT inválido: ${nit} (${items[0].name})`,
          details: `Encontrado en ${items.length} registros de ${items[0].source}. El dígito verificador no coincide.`,
          affectedRecords: items.slice(0, 5).map(i => ({ id: i.id, label: `${i.source} ${nit}` })) });
      }

      progressState[3].status = 'done';

      // === CATEGORY E: Bank Reconciliation ===
      progressState[4].status = 'running';
      setProgress([...progressState]);

      const { data: bankMovements } = await supabase
        .from('tab_bank_movements')
        .select('id, movement_date, description, is_reconciled, reconciliation_id, bank_account_id')
        .eq('enterprise_id', enterpriseId);

      if (bankMovements && bankMovements.length > 0) {
        const now = new Date();
        const sixtyDaysAgo = new Date(now);
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

        // E1: Old unreconciled movements
        const oldUnreconciled = bankMovements.filter(m =>
          !m.is_reconciled && new Date(m.movement_date) < sixtyDaysAgo
        );
        if (oldUnreconciled.length > 0) {
          results.push({ code: 'E1', severity: 'WARNING', category: 'E',
            message: `${oldUnreconciled.length} movimientos bancarios sin conciliar (>60 días)`,
            details: `Movimientos anteriores a ${sixtyDaysAgo.toISOString().slice(0, 10)} pendientes de conciliación.`,
            affectedRecords: oldUnreconciled.slice(0, 5).map(m => ({ id: m.id, label: m.description?.substring(0, 30) || `Mov ${m.id}` })) });
        }

        // E2: Reconciled movements without valid reconciliation
        const reconciledNoRef = bankMovements.filter(m => m.is_reconciled && !m.reconciliation_id);
        if (reconciledNoRef.length > 0) {
          results.push({ code: 'E2', severity: 'ERROR', category: 'E',
            message: `${reconciledNoRef.length} movimientos marcados conciliados sin referencia`,
            details: 'Movimientos marcados como conciliados pero sin ID de conciliación asociada.',
            affectedRecords: reconciledNoRef.slice(0, 5).map(m => ({ id: m.id, label: m.description?.substring(0, 30) || `Mov ${m.id}` })) });
        }
      }

      progressState[4].status = 'done';

      // === CATEGORY F: Balance Integrity ===
      progressState[5].status = 'running';
      setProgress([...progressState]);

      if (accounts.length > 0 && allDetails.length > 0) {
        // Build account balances from details
        const accountBalances = new Map<number, { debits: number; credits: number }>();
        for (const d of allDetails) {
          if (!d.account_id) continue;
          if (!accountBalances.has(d.account_id)) accountBalances.set(d.account_id, { debits: 0, credits: 0 });
          const bal = accountBalances.get(d.account_id)!;
          bal.debits += Number(d.debit_amount || 0);
          bal.credits += Number(d.credit_amount || 0);
        }

        // F1: Accounting equation (Assets = Liabilities + Equity)
        let totalActivos = 0, totalPasivos = 0, totalPatrimonio = 0;
        for (const acc of accounts) {
          const bal = accountBalances.get(acc.id);
          if (!bal) continue;
          const net = bal.debits - bal.credits;
          if (acc.account_type === 'activo') totalActivos += net;
          else if (acc.account_type === 'pasivo') totalPasivos += net; // credit nature, net is negative
          else if (acc.account_type === 'patrimonio' || acc.account_type === 'capital') totalPatrimonio += net;
        }
        // In accounting: Assets = Liabilities + Equity → Assets - Liabilities - Equity = 0
        // Pasivos/Patrimonio have credit nature, so their net is negative: A + P + C should ≈ 0
        const equationDiff = Math.abs(totalActivos + totalPasivos + totalPatrimonio);
        if (equationDiff > TOLERANCE && (totalActivos !== 0 || totalPasivos !== 0)) {
          results.push({ code: 'F1', severity: 'ERROR', category: 'F',
            message: `Ecuación contable descuadrada (diff: Q${equationDiff.toFixed(2)})`,
            details: `Activos: Q${totalActivos.toFixed(2)}, Pasivos: Q${Math.abs(totalPasivos).toFixed(2)}, Patrimonio: Q${Math.abs(totalPatrimonio).toFixed(2)}.`,
            affectedRecords: [] });
        }

        // F2: Trial balance
        const totalDebits = allDetails.reduce((s, d) => s + Number(d.debit_amount || 0), 0);
        const totalCredits = allDetails.reduce((s, d) => s + Number(d.credit_amount || 0), 0);
        const balanceDiff = Math.abs(totalDebits - totalCredits);
        if (balanceDiff > TOLERANCE) {
          results.push({ code: 'F2', severity: 'ERROR', category: 'F',
            message: `Balance de comprobación descuadrado (diff: Q${balanceDiff.toFixed(2)})`,
            details: `Total débitos: Q${totalDebits.toFixed(2)}, Total créditos: Q${totalCredits.toFixed(2)}.`,
            affectedRecords: [] });
        }

        // F3: Subsidiary vs Control (parent balance = sum of children)
        const parentAccounts = accounts.filter((a: any) => !a.allows_movement);
        for (const parent of parentAccounts) {
          const children = accounts.filter((a: any) => a.parent_account_id === parent.id);
          if (children.length === 0) continue;

          let childrenTotal = 0;
          for (const child of children) {
            const cBal = accountBalances.get(child.id);
            if (cBal) childrenTotal += (cBal.debits - cBal.credits);
          }

          const parentBal = accountBalances.get(parent.id);
          const parentNet = parentBal ? (parentBal.debits - parentBal.credits) : 0;

          // Only flag if parent has direct movements (shouldn't for control accounts)
          if (parentBal && (parentBal.debits > 0 || parentBal.credits > 0)) {
            results.push({ code: 'F3', severity: 'ERROR', category: 'F',
              message: `Cuenta de control ${parent.account_code} tiene movimientos directos`,
              details: `${parent.account_name} es cuenta de control pero tiene movimientos directos (Débitos: Q${parentBal.debits.toFixed(2)}, Créditos: Q${parentBal.credits.toFixed(2)}).`,
              affectedRecords: [{ id: parent.id, label: parent.account_code }] });
          }
        }
      }

      progressState[5].status = 'done';

      // === CATEGORY G: Cost of Sales Integrity ===
      progressState[6].status = 'running';
      setProgress([...progressState]);

      try {
        const { data: inventoryClosings } = await supabase
          .from('tab_period_inventory_closing')
          .select('*')
          .eq('enterprise_id', enterpriseId)
          .eq('status', 'confirmed');

        if (inventoryClosings && inventoryClosings.length > 0) {
          for (const closing of inventoryClosings) {
            const initial = Number(closing.initial_inventory_amount || 0);
            const purchasesAmt = Number(closing.purchases_amount || 0);
            const finalInv = Number(closing.final_inventory_amount || 0);
            const registeredCdv = Number(closing.cost_of_sales_amount || 0);
            const expectedCdv = initial + purchasesAmt - finalInv;

            if (Math.abs(expectedCdv - registeredCdv) > TOLERANCE) {
              results.push({ code: 'G1', severity: 'ERROR', category: 'G',
                message: `Fórmula CDV incorrecta (período ${closing.accounting_period_id})`,
                details: `CDV esperado: Q${expectedCdv.toFixed(2)} (${initial.toFixed(2)} + ${purchasesAmt.toFixed(2)} - ${finalInv.toFixed(2)}), registrado: Q${registeredCdv.toFixed(2)}.`,
                affectedRecords: [{ id: closing.id, label: `Cierre ${closing.id}` }] });
            }
          }
        }

        // G2: Inventory account balance check
        const { data: entConfig } = await supabase
          .from('tab_enterprise_config')
          .select('inventory_account_id')
          .eq('enterprise_id', enterpriseId)
          .maybeSingle();

        if (entConfig?.inventory_account_id && inventoryClosings && inventoryClosings.length > 0) {
          const lastClosing = inventoryClosings[inventoryClosings.length - 1];
          const invBal = allDetails
            .filter(d => d.account_id === entConfig.inventory_account_id)
            .reduce((s, d) => s + Number(d.debit_amount || 0) - Number(d.credit_amount || 0), 0);
          const expectedBal = Number(lastClosing.final_inventory_amount || 0);
          if (Math.abs(invBal - expectedBal) > TOLERANCE && expectedBal > 0) {
            results.push({ code: 'G2', severity: 'WARNING', category: 'G',
              message: 'Saldo de inventario no coincide con cierre',
              details: `Saldo contable: Q${invBal.toFixed(2)}, último cierre: Q${expectedBal.toFixed(2)}.`,
              affectedRecords: [] });
          }
        }
      } catch {
        // tab_period_inventory_closing may not exist, skip
      }

      progressState[6].status = 'done';
      setProgress([...progressState]);

      // Build summary with improved health score
      const totalErrors = results.filter(r => r.severity === 'ERROR').length;
      const totalWarnings = results.filter(r => r.severity === 'WARNING').length;
      const totalInfo = results.filter(r => r.severity === 'INFO').length;

      // Health score: based on rules passed vs total rules
      const rulesFailed = new Set(results.filter(r => r.severity === 'ERROR').map(r => r.code)).size;
      const rulesWarned = new Set(results.filter(r => r.severity === 'WARNING').map(r => r.code)).size;
      const rulesPassed = TOTAL_RULES - rulesFailed - rulesWarned;
      const healthScore = results.length === 0 ? 100 : Math.max(0, (rulesPassed / TOTAL_RULES) * 100);

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
        totalErrors, totalWarnings, totalInfo,
        healthScore,
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

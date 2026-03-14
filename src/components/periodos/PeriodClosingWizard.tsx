import { useState, useEffect, useCallback, useMemo } from 'react';
import { TruncatedText } from "@/components/ui/truncated-text";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Calculator, 
  Scale, 
  Lock, 
  PartyPopper,
  Loader2,
  ExternalLink,
  AlertCircle,
  Package,
  RefreshCw,
  ArrowRightLeft,
  BookOpen
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEnterpriseConfig } from '@/hooks/useEnterpriseConfig';
import { useCostOfSalesCalculation } from '@/hooks/useCostOfSalesCalculation';
import { fetchAllRecords } from '@/utils/supabaseHelpers';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Period {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

interface PendingEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  status: string;
  total_debit: number;
}

interface AccountBalance {
  account_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  balance: number;
}

interface ExistingEntry {
  id: number;
  entry_number: string;
  status: string;
  is_posted: boolean;
}

interface StepDef {
  id: string;
  title: string;
  icon: any;
  description: string;
}

interface PeriodClosingWizardProps {
  open: boolean;
  period: Period | null;
  enterpriseId: number;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PeriodClosingWizard({ 
  open, 
  period, 
  enterpriseId, 
  onOpenChange, 
  onSuccess 
}: PeriodClosingWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Step: Pending entries
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [continueDespitePending, setContinueDespitePending] = useState(false);
  
  // Step: Closing entry (results)
  const [incomeAccounts, setIncomeAccounts] = useState<AccountBalance[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<AccountBalance[]>([]);
  const [closingEntryGenerated, setClosingEntryGenerated] = useState(false);
  const [closingEntryId, setClosingEntryId] = useState<number | null>(null);
  const [closingEntryNumber, setClosingEntryNumber] = useState<string | null>(null);
  const [closingEntryStatus, setClosingEntryStatus] = useState<string | null>(null);
  
  // Step: Transfer to equity
  const [transferEntryGenerated, setTransferEntryGenerated] = useState(false);
  const [transferEntryId, setTransferEntryId] = useState<number | null>(null);
  const [transferEntryNumber, setTransferEntryNumber] = useState<string | null>(null);
  const [transferEntryStatus, setTransferEntryStatus] = useState<string | null>(null);

  // Step: Opening balance
  const [openingEntryGenerated, setOpeningEntryGenerated] = useState(false);
  const [openingEntryId, setOpeningEntryId] = useState<number | null>(null);
  const [openingEntryNumber, setOpeningEntryNumber] = useState<string | null>(null);
  const [openingEntryStatus, setOpeningEntryStatus] = useState<string | null>(null);
  const [openingBalanceAccounts, setOpeningBalanceAccounts] = useState<AccountBalance[]>([]);
  
  // Step: Balance verification
  const [totalAssets, setTotalAssets] = useState(0);
  const [totalLiabilities, setTotalLiabilities] = useState(0);
  const [totalEquity, setTotalEquity] = useState(0);
  const [isBalanced, setIsBalanced] = useState(false);
  
  // Step: Confirmation
  const [confirmClose, setConfirmClose] = useState(false);
  
  const { config } = useEnterpriseConfig(enterpriseId);
  
  const cdv = useCostOfSalesCalculation(enterpriseId, period?.id || 0);
  
  const hasCdvStep = config?.cost_of_sales_method === 'coeficiente';

  // Dynamic steps
  const steps = useMemo<StepDef[]>(() => {
    const s: StepDef[] = [
      { id: 'partidas', title: 'Partidas', icon: FileText, description: 'Revisar pendientes' },
    ];
    if (hasCdvStep) {
      s.push({ id: 'cdv', title: 'Costo Ventas', icon: Package, description: 'Calcular CDV' });
    }
    s.push(
      { id: 'generar', title: 'Cierre', icon: Calculator, description: 'Cierre de resultados' },
      { id: 'traslado', title: 'Traslado', icon: ArrowRightLeft, description: 'A utilidades' },
      { id: 'apertura', title: 'Apertura', icon: BookOpen, description: 'Partida apertura' },
      { id: 'verificar', title: 'Verificar', icon: Scale, description: 'Balances' },
      { id: 'confirmar', title: 'Confirmar', icon: Lock, description: 'Cierre' },
      { id: 'completado', title: 'Completado', icon: PartyPopper, description: '' },
    );
    return s;
  }, [hasCdvStep]);

  const currentStepId = steps[currentStepIndex]?.id || 'partidas';
  
  const totalIncome = incomeAccounts.reduce((sum, acc) => sum + (-acc.balance), 0);
  const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const periodResult = totalIncome - totalExpenses;

  // ---- Find existing entries ----
  const findExistingEntry = useCallback(async (entryType: string, periodId: number, prefix: string): Promise<ExistingEntry | null> => {
    const { data, error } = await supabase
      .from('tab_journal_entries')
      .select('id, entry_number, status, is_posted')
      .eq('enterprise_id', enterpriseId)
      .eq('accounting_period_id', periodId)
      .eq('entry_type', entryType)
      .ilike('entry_number', `${prefix}-%`)
      .is('deleted_at', null)
      .is('reversal_entry_id', null)
      .order('is_posted', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return (data as ExistingEntry | null) ?? null;
  }, [enterpriseId]);

  const syncExistingEntries = useCallback(async () => {
    if (!period) return;
    try {
      // Check closing entry
      const closingEntry = await findExistingEntry('cierre', period.id, 'CIER');
      if (closingEntry) {
        setClosingEntryGenerated(true);
        setClosingEntryId(closingEntry.id);
        setClosingEntryNumber(closingEntry.entry_number);
        setClosingEntryStatus(closingEntry.status);
      }

      // Check transfer entry
      const transferEntry = await findExistingEntry('cierre', period.id, 'TRAS');
      if (transferEntry) {
        setTransferEntryGenerated(true);
        setTransferEntryId(transferEntry.id);
        setTransferEntryNumber(transferEntry.entry_number);
        setTransferEntryStatus(transferEntry.status);
      }

      // Check opening entry (in next period)
      const nextYear = period.year + 1;
      const { data: nextPeriod } = await supabase
        .from('tab_accounting_periods')
        .select('id')
        .eq('enterprise_id', enterpriseId)
        .eq('year', nextYear)
        .maybeSingle();

      if (nextPeriod) {
        const openEntry = await findExistingEntry('apertura', nextPeriod.id, 'APER');
        if (openEntry) {
          setOpeningEntryGenerated(true);
          setOpeningEntryId(openEntry.id);
          setOpeningEntryNumber(openEntry.entry_number);
          setOpeningEntryStatus(openEntry.status);
        }
      }
    } catch (error) {
      console.error('Error loading existing entries:', error);
    }
  }, [period, enterpriseId, findExistingEntry]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && period) {
      setCurrentStepIndex(0);
      setPendingEntries([]);
      setContinueDespitePending(false);
      setIncomeAccounts([]);
      setExpenseAccounts([]);
      setClosingEntryGenerated(false);
      setClosingEntryId(null);
      setClosingEntryNumber(null);
      setClosingEntryStatus(null);
      setTransferEntryGenerated(false);
      setTransferEntryId(null);
      setTransferEntryNumber(null);
      setTransferEntryStatus(null);
      setOpeningEntryGenerated(false);
      setOpeningEntryId(null);
      setOpeningEntryNumber(null);
      setOpeningEntryStatus(null);
      setOpeningBalanceAccounts([]);
      setTotalAssets(0);
      setTotalLiabilities(0);
      setTotalEquity(0);
      setIsBalanced(false);
      setConfirmClose(false);
      loadPendingEntries();
      syncExistingEntries();
    }
  }, [open, period, syncExistingEntries]);

  const loadPendingEntries = async () => {
    if (!period) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tab_journal_entries')
        .select('id, entry_number, entry_date, description, status, total_debit')
        .eq('enterprise_id', enterpriseId)
        .eq('accounting_period_id', period.id)
        .in('status', ['borrador', 'pendiente_revision'])
        .order('entry_date', { ascending: false });
      
      if (error) throw error;
      setPendingEntries(data || []);
    } catch (error) {
      console.error('Error loading pending entries:', error);
      toast.error('Error al cargar partidas pendientes');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountBalances = useCallback(async () => {
    if (!period) return;
    
    setLoading(true);
    try {
      const { data: accounts, error: accountsError } = await supabase
        .from('tab_accounts')
        .select('id, account_code, account_name, account_type, allows_movement')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);
      
      if (accountsError) throw accountsError;
      
      const entries = await fetchAllRecords(
        supabase
          .from('tab_journal_entries')
          .select(`
            id,
            tab_journal_entry_details (
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .eq('enterprise_id', enterpriseId)
          .eq('accounting_period_id', period.id)
          .eq('is_posted', true)
      );
      
      const balanceMap = new Map<number, number>();
      
      entries.forEach((entry: any) => {
        entry.tab_journal_entry_details?.forEach((detail: any) => {
          const currentBalance = balanceMap.get(detail.account_id) || 0;
          const debit = detail.debit_amount || 0;
          const credit = detail.credit_amount || 0;
          balanceMap.set(detail.account_id, currentBalance + debit - credit);
        });
      });
      
      const incomes: AccountBalance[] = [];
      const expenses: AccountBalance[] = [];
      
      accounts?.forEach(account => {
        const balance = balanceMap.get(account.id) || 0;
        const accountTypeLower = account.account_type?.toLowerCase() || '';
        const isIncomeOrExpense = accountTypeLower === 'ingreso' || accountTypeLower === 'gasto' || accountTypeLower === 'costo';
        const isDetailAccount = account.allows_movement === true;
        
        if (Math.abs(balance) > 0.01 && isIncomeOrExpense && isDetailAccount) {
          const accBalance: AccountBalance = {
            account_id: account.id,
            account_code: account.account_code,
            account_name: account.account_name,
            account_type: account.account_type,
            balance: balance
          };
          
          if (accountTypeLower === 'ingreso') {
            incomes.push(accBalance);
          } else if (accountTypeLower === 'gasto' || accountTypeLower === 'costo') {
            expenses.push(accBalance);
          }
        }
      });
      
      setIncomeAccounts(incomes.sort((a, b) => a.account_code.localeCompare(b.account_code)));
      setExpenseAccounts(expenses.sort((a, b) => a.account_code.localeCompare(b.account_code)));
    } catch (error) {
      console.error('Error loading account balances:', error);
      toast.error('Error al cargar saldos de cuentas');
    } finally {
      setLoading(false);
    }
  }, [period, enterpriseId]);

  // ---- Generate Closing Entry (Results) ----
  const generateClosingEntry = async () => {
    if (!period || !config?.period_result_account_id) {
      toast.error('Falta configurar la cuenta de Resultado del Período');
      return;
    }
    
    setLoading(true);
    try {
      const existingEntry = await findExistingEntry('cierre', period.id, 'CIER');
      if (existingEntry) {
        setClosingEntryGenerated(true);
        setClosingEntryId(existingEntry.id);
        setClosingEntryNumber(existingEntry.entry_number);
        setClosingEntryStatus(existingEntry.status);
        toast.info(`La partida ${existingEntry.entry_number} ya existe.`);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Clean up orphaned CIER drafts
      const { data: orphanedEntries } = await supabase
        .from('tab_journal_entries')
        .select('id')
        .eq('enterprise_id', enterpriseId)
        .eq('accounting_period_id', period.id)
        .ilike('entry_number', 'CIER-%')
        .eq('status', 'borrador')
        .eq('is_posted', false);

      if (orphanedEntries && orphanedEntries.length > 0) {
        const orphanIds = orphanedEntries.map(e => e.id);
        await supabase.from('tab_journal_entry_details').delete().in('journal_entry_id', orphanIds);
        await supabase.from('tab_journal_entries').delete().in('id', orphanIds);
      }

      const year = period.year;
      const { data: lastEntry } = await supabase
        .from('tab_journal_entries')
        .select('entry_number')
        .eq('enterprise_id', enterpriseId)
        .ilike('entry_number', `CIER-${year}%`)
        .order('entry_number', { ascending: false })
        .limit(1);
      
      let nextNumber = 1;
      if (lastEntry && lastEntry.length > 0) {
        const lastNum = lastEntry[0].entry_number.split('-').pop();
        nextNumber = parseInt(lastNum || '0') + 1;
      }
      
      const entryNumber = `CIER-${year}-${String(nextNumber).padStart(4, '0')}`;

      type DraftLine = {
        line_number: number;
        account_id: number;
        description: string;
        debit_amount: number;
        credit_amount: number;
      };

      const detailLines: DraftLine[] = [];
      let lineNumber = 1;
      let totalDebits = 0;
      let totalCredits = 0;

      const addClosingLine = (acc: AccountBalance) => {
        const amount = Math.round(Math.abs(acc.balance) * 100) / 100;
        if (amount <= 0.01) return;

        const debit = acc.balance < 0 ? amount : 0;
        const credit = acc.balance > 0 ? amount : 0;

        detailLines.push({
          line_number: lineNumber++,
          account_id: acc.account_id,
          description: `Cierre ${acc.account_code} - ${acc.account_name}`,
          debit_amount: debit,
          credit_amount: credit,
        });

        totalDebits += debit;
        totalCredits += credit;
      };

      incomeAccounts.forEach(addClosingLine);
      expenseAccounts.forEach(addClosingLine);

      // Offset to "Resultado del período"
      const resultAmount = Math.round(Math.abs(totalDebits - totalCredits) * 100) / 100;
      if (resultAmount > 0.01) {
        const isProfit = totalDebits > totalCredits;
        const resultDebit = isProfit ? 0 : resultAmount;
        const resultCredit = isProfit ? resultAmount : 0;

        detailLines.push({
          line_number: lineNumber,
          account_id: config.period_result_account_id,
          description: `${isProfit ? 'Utilidad' : 'Pérdida'} del período ${period.year}`,
          debit_amount: resultDebit,
          credit_amount: resultCredit,
        });

        totalDebits += resultDebit;
        totalCredits += resultCredit;
      }

      totalDebits = Math.round(totalDebits * 100) / 100;
      totalCredits = Math.round(totalCredits * 100) / 100;

      const { data: newEntry, error: entryError } = await supabase
        .from('tab_journal_entries')
        .insert({
          enterprise_id: enterpriseId,
          accounting_period_id: period.id,
          entry_number: entryNumber,
          entry_date: period.end_date,
          entry_type: 'cierre',
          description: `Partida de cierre de resultados del período ${period.year}`,
          total_debit: totalDebits,
          total_credit: totalCredits,
          is_posted: false,
          status: 'borrador',
          created_by: user?.id || null,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const detailsWithEntryId = detailLines.map((line) => ({
        ...line,
        journal_entry_id: newEntry.id,
      }));

      const { error: detailsError } = await supabase
        .from('tab_journal_entry_details')
        .insert(detailsWithEntryId);
      
      if (detailsError) throw detailsError;
      
      setClosingEntryId(newEntry.id);
      setClosingEntryGenerated(true);
      setClosingEntryNumber(entryNumber);
      setClosingEntryStatus('borrador');
      toast.success(`Partida de cierre ${entryNumber} generada exitosamente`);
    } catch (error: any) {
      console.error('Error generating closing entry:', error);
      const detail = error?.message || error?.details || 'Error desconocido';
      toast.error(`Error al generar partida de cierre: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- Generate Transfer Entry (Result → Retained Earnings) ----
  const generateTransferEntry = async () => {
    if (!period || !config?.period_result_account_id || !config?.retained_earnings_account_id) {
      toast.error('Falta configurar la cuenta de Utilidades Acumuladas en Configuración → Cuentas Especiales');
      return;
    }

    setLoading(true);
    try {
      const existingEntry = await findExistingEntry('cierre', period.id, 'TRAS');
      if (existingEntry) {
        setTransferEntryGenerated(true);
        setTransferEntryId(existingEntry.id);
        setTransferEntryNumber(existingEntry.entry_number);
        setTransferEntryStatus(existingEntry.status);
        toast.info(`La partida ${existingEntry.entry_number} ya existe.`);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const year = period.year;

      // Calculate result amount: the balance in the period_result_account after the closing entry
      // The closing entry credits (profit) or debits (loss) this account
      // We need to compute its actual balance
      const resultAmount = Math.abs(periodResult);
      if (resultAmount <= 0.01) {
        toast.info('El resultado del período es cero, no se requiere traslado.');
        setTransferEntryGenerated(true);
        setTransferEntryStatus('no_requerido');
        return;
      }

      const entryNumber = `TRAS-${year}-0001`;
      const isProfit = periodResult >= 0;

      // If profit: Resultado del ejercicio (debit) → Utilidades acumuladas (credit)
      // If loss: Utilidades acumuladas (debit) → Resultado del ejercicio (credit)
      const lines = [
        {
          line_number: 1,
          account_id: config.period_result_account_id,
          description: `Traslado ${isProfit ? 'utilidad' : 'pérdida'} ${year} a utilidades acumuladas`,
          debit_amount: isProfit ? resultAmount : 0,
          credit_amount: isProfit ? 0 : resultAmount,
        },
        {
          line_number: 2,
          account_id: config.retained_earnings_account_id,
          description: `${isProfit ? 'Utilidad' : 'Pérdida'} del ejercicio ${year}`,
          debit_amount: isProfit ? 0 : resultAmount,
          credit_amount: isProfit ? resultAmount : 0,
        },
      ];

      const totalAmount = Math.round(resultAmount * 100) / 100;

      const { data: newEntry, error: entryError } = await supabase
        .from('tab_journal_entries')
        .insert({
          enterprise_id: enterpriseId,
          accounting_period_id: period.id,
          entry_number: entryNumber,
          entry_date: period.end_date,
          entry_type: 'cierre',
          description: `Traslado de ${isProfit ? 'utilidad' : 'pérdida'} del ejercicio ${year} a utilidades acumuladas`,
          total_debit: totalAmount,
          total_credit: totalAmount,
          is_posted: false,
          status: 'borrador',
          created_by: user?.id || null,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const { error: detailsError } = await supabase
        .from('tab_journal_entry_details')
        .insert(lines.map(l => ({ ...l, journal_entry_id: newEntry.id })));

      if (detailsError) throw detailsError;

      setTransferEntryId(newEntry.id);
      setTransferEntryGenerated(true);
      setTransferEntryNumber(entryNumber);
      setTransferEntryStatus('borrador');
      toast.success(`Partida de traslado ${entryNumber} generada`);
    } catch (error: any) {
      console.error('Error generating transfer entry:', error);
      toast.error(`Error al generar partida de traslado: ${error?.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- Generate Opening Balance Entry ----
  const generateOpeningEntry = async () => {
    if (!period) return;

    setLoading(true);
    try {
      const nextYear = period.year + 1;

      // Ensure next period exists
      let nextPeriodId: number;
      const { data: existingNext } = await supabase
        .from('tab_accounting_periods')
        .select('id')
        .eq('enterprise_id', enterpriseId)
        .eq('year', nextYear)
        .maybeSingle();

      if (existingNext) {
        nextPeriodId = existingNext.id;
      } else {
        const { data: newPeriod, error: periodError } = await supabase
          .from('tab_accounting_periods')
          .insert({
            enterprise_id: enterpriseId,
            year: nextYear,
            start_date: `${nextYear}-01-01`,
            end_date: `${nextYear}-12-31`,
            status: 'abierto',
          })
          .select('id')
          .single();

        if (periodError) throw periodError;
        nextPeriodId = newPeriod.id;
        toast.success(`Período ${nextYear} creado automáticamente`);
      }

      // Check if opening entry already exists
      const existingEntry = await findExistingEntry('apertura', nextPeriodId, 'APER');
      if (existingEntry) {
        setOpeningEntryGenerated(true);
        setOpeningEntryId(existingEntry.id);
        setOpeningEntryNumber(existingEntry.entry_number);
        setOpeningEntryStatus(existingEntry.status);
        toast.info(`La partida ${existingEntry.entry_number} ya existe.`);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Get all accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('tab_accounts')
        .select('id, account_code, account_name, account_type, balance_type, allows_movement')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);

      if (accountsError) throw accountsError;

      // Calculate cumulative balances up to end of closing period (including closing and transfer entries)
      const entries = await fetchAllRecords(
        supabase
          .from('tab_journal_entries')
          .select(`
            id,
            tab_journal_entry_details (
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .eq('enterprise_id', enterpriseId)
          .eq('is_posted', true)
          .is('deleted_at', null)
          .lte('entry_date', period.end_date)
      );

      const balanceMap = new Map<number, number>();
      entries.forEach((entry: any) => {
        entry.tab_journal_entry_details?.forEach((detail: any) => {
          const currentBalance = balanceMap.get(detail.account_id) || 0;
          balanceMap.set(detail.account_id, currentBalance + (detail.debit_amount || 0) - (detail.credit_amount || 0));
        });
      });

      // Also include draft closing & transfer entries that haven't been posted yet
      const draftIds = [closingEntryId, transferEntryId].filter(Boolean);
      if (draftIds.length > 0) {
        const { data: draftDetails } = await supabase
          .from('tab_journal_entry_details')
          .select('account_id, debit_amount, credit_amount')
          .in('journal_entry_id', draftIds);

        draftDetails?.forEach((detail: any) => {
          // Only add if not already counted (entry wasn't posted)
          const entryPosted = (detail.journal_entry_id === closingEntryId && closingEntryStatus === 'contabilizado') ||
                              (detail.journal_entry_id === transferEntryId && transferEntryStatus === 'contabilizado');
          if (!entryPosted) {
            const currentBalance = balanceMap.get(detail.account_id) || 0;
            balanceMap.set(detail.account_id, currentBalance + (detail.debit_amount || 0) - (detail.credit_amount || 0));
          }
        });
      }

      // Build opening entry lines — only balance sheet accounts
      type OpeningLine = {
        line_number: number;
        account_id: number;
        description: string;
        debit_amount: number;
        credit_amount: number;
      };

      const openingLines: OpeningLine[] = [];
      const balanceAccounts: AccountBalance[] = [];
      let lineNumber = 1;
      let totalDebits = 0;
      let totalCredits = 0;

      accounts?.forEach(account => {
        if (!account.allows_movement) return;
        const accountTypeLower = account.account_type?.toLowerCase() || '';
        // Only balance sheet accounts
        if (!['activo', 'pasivo', 'capital', 'patrimonio'].includes(accountTypeLower)) return;

        const rawBalance = balanceMap.get(account.id) || 0;
        if (Math.abs(rawBalance) <= 0.01) return;

        // rawBalance is debit - credit
        const debitAmount = rawBalance > 0 ? Math.round(rawBalance * 100) / 100 : 0;
        const creditAmount = rawBalance < 0 ? Math.round(Math.abs(rawBalance) * 100) / 100 : 0;

        openingLines.push({
          line_number: lineNumber++,
          account_id: account.id,
          description: `Saldo inicial ${account.account_code} - ${account.account_name}`,
          debit_amount: debitAmount,
          credit_amount: creditAmount,
        });

        totalDebits += debitAmount;
        totalCredits += creditAmount;

        balanceAccounts.push({
          account_id: account.id,
          account_code: account.account_code,
          account_name: account.account_name,
          account_type: account.account_type,
          balance: rawBalance,
        });
      });

      setOpeningBalanceAccounts(balanceAccounts.sort((a, b) => a.account_code.localeCompare(b.account_code)));

      if (openingLines.length === 0) {
        toast.info('No hay saldos de balance para trasladar.');
        setOpeningEntryGenerated(true);
        setOpeningEntryStatus('no_requerido');
        return;
      }

      totalDebits = Math.round(totalDebits * 100) / 100;
      totalCredits = Math.round(totalCredits * 100) / 100;

      const entryNumber = `APER-${nextYear}-0001`;

      const { data: newEntry, error: entryError } = await supabase
        .from('tab_journal_entries')
        .insert({
          enterprise_id: enterpriseId,
          accounting_period_id: nextPeriodId,
          entry_number: entryNumber,
          entry_date: `${nextYear}-01-01`,
          entry_type: 'apertura',
          description: `Partida de apertura del ejercicio ${nextYear}`,
          total_debit: totalDebits,
          total_credit: totalCredits,
          is_posted: false,
          status: 'borrador',
          created_by: user?.id || null,
        })
        .select('id')
        .single();

      if (entryError) throw entryError;

      const { error: detailsError } = await supabase
        .from('tab_journal_entry_details')
        .insert(openingLines.map(l => ({ ...l, journal_entry_id: newEntry.id })));

      if (detailsError) throw detailsError;

      setOpeningEntryId(newEntry.id);
      setOpeningEntryGenerated(true);
      setOpeningEntryNumber(entryNumber);
      setOpeningEntryStatus('borrador');
      toast.success(`Partida de apertura ${entryNumber} generada para ${nextYear}`);
    } catch (error: any) {
      console.error('Error generating opening entry:', error);
      toast.error(`Error al generar partida de apertura: ${error?.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- Balance Verification ----
  const loadBalanceVerification = useCallback(async () => {
    if (!period) return;
    
    setLoading(true);
    try {
      const { data: accounts, error: accountsError } = await supabase
        .from('tab_accounts')
        .select('id, account_code, account_name, account_type, balance_type, allows_movement')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);
      
      if (accountsError) throw accountsError;

      const entries = await fetchAllRecords(
        supabase
          .from('tab_journal_entries')
          .select(`
            id,
            tab_journal_entry_details (
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .eq('enterprise_id', enterpriseId)
          .eq('is_posted', true)
          .is('deleted_at', null)
          .lte('entry_date', period.end_date)
      );
      
      const balanceMap = new Map<number, number>();
      
      entries.forEach((entry: any) => {
        entry.tab_journal_entry_details?.forEach((detail: any) => {
          const currentBalance = balanceMap.get(detail.account_id) || 0;
          const debit = detail.debit_amount || 0;
          const credit = detail.credit_amount || 0;
          balanceMap.set(detail.account_id, currentBalance + debit - credit);
        });
      });

      let assets = 0;
      let liabilities = 0;
      let equity = 0;
      
      accounts?.forEach(account => {
        if (!account.allows_movement) return;
        const rawBalance = balanceMap.get(account.id) || 0;
        const accountTypeLower = account.account_type?.toLowerCase() || '';
        
        switch (accountTypeLower) {
          case 'activo':
            assets += rawBalance;
            break;
          case 'pasivo':
            liabilities += -rawBalance;
            break;
          case 'capital':
          case 'patrimonio':
            equity += -rawBalance;
            break;
          case 'ingreso':
            equity += -rawBalance;
            break;
          case 'gasto':
          case 'costo':
            assets += rawBalance;
            break;
        }
      });
      
      setTotalAssets(Math.round(assets * 100) / 100);
      setTotalLiabilities(Math.round(liabilities * 100) / 100);
      setTotalEquity(Math.round(equity * 100) / 100);
      
      const diff = Math.abs(assets - (liabilities + equity));
      setIsBalanced(diff < 0.01);
    } catch (error) {
      console.error('Error loading balance verification:', error);
      toast.error('Error al verificar balances');
    } finally {
      setLoading(false);
    }
  }, [period, enterpriseId]);

  // ---- Close Period ----
  const handleClosePeriod = async () => {
    if (!period) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Post all draft entries: closing, transfer, opening
      const entriesToPost = [
        { id: closingEntryId, status: closingEntryStatus, label: 'cierre' },
        { id: transferEntryId, status: transferEntryStatus, label: 'traslado' },
        { id: openingEntryId, status: openingEntryStatus, label: 'apertura' },
      ];

      for (const entry of entriesToPost) {
        if (entry.id && entry.status !== 'contabilizado' && entry.status !== 'no_requerido') {
          const { error: postError } = await supabase
            .from('tab_journal_entries')
            .update({
              is_posted: true,
              status: 'contabilizado',
              posted_at: new Date().toISOString()
            })
            .eq('id', entry.id);
          
          if (postError) throw new Error(`Error al contabilizar partida de ${entry.label}: ${postError.message}`);
        }
      }
      
      // Close the period
      const { error: closeError } = await supabase
        .from('tab_accounting_periods')
        .update({
          status: 'cerrado',
          closed_at: new Date().toISOString(),
          closed_by: user?.id
        })
        .eq('id', period.id);
      
      if (closeError) throw closeError;

      const activePeriodId = localStorage.getItem('activePeriodId');
      if (activePeriodId === String(period.id)) {
        localStorage.removeItem('activePeriodId');
        localStorage.removeItem('activePeriodData');
        window.dispatchEvent(new CustomEvent('periodChanged'));
      }
      
      setClosingEntryStatus('contabilizado');
      setTransferEntryStatus('contabilizado');
      setOpeningEntryStatus('contabilizado');
      toast.success('Período cerrado exitosamente');
      setCurrentStepIndex(steps.length - 1);
    } catch (error: any) {
      console.error('Error closing period:', error);
      toast.error(`Error al cerrar el período: ${error?.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  // ---- Navigation Logic ----
  const canAdvance = () => {
    switch (currentStepId) {
      case 'partidas':
        return pendingEntries.length === 0 || continueDespitePending;
      case 'cdv':
        if (cdv.closingData?.status === 'contabilizado' && cdv.closingData?.journal_entry_id) return true;
        return cdv.finalInventory !== null &&
          cdv.costOfSales !== null &&
          !!config?.inventory_account_id &&
          !!config?.purchases_account_id &&
          !!config?.cost_of_sales_account_id;
      case 'generar':
        return (incomeAccounts.length > 0 || expenseAccounts.length > 0 || closingEntryGenerated) && !!config?.period_result_account_id;
      case 'traslado':
        return transferEntryGenerated || !config?.retained_earnings_account_id;
      case 'apertura':
        return openingEntryGenerated;
      case 'verificar':
        return true;
      case 'confirmar':
        return confirmClose && (closingEntryId || closingEntryGenerated);
      default:
        return true;
    }
  };

  const handleNext = async () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex >= steps.length) return;
    const nextStepId = steps[nextIndex].id;

    if (currentStepId === 'partidas' && canAdvance()) {
      if (nextStepId === 'cdv') {
        setCurrentStepIndex(nextIndex);
        cdv.calculate();
      } else {
        setCurrentStepIndex(nextIndex);
        await loadAccountBalances();
      }
    } else if (currentStepId === 'cdv' && canAdvance()) {
      if (cdv.closingData?.status === 'contabilizado' && cdv.closingData?.journal_entry_id) {
        setCurrentStepIndex(nextIndex);
        await loadAccountBalances();
        return;
      }

      setLoading(true);
      try {
        let journalEntryId = cdv.closingData?.journal_entry_id ?? null;

        if (!journalEntryId && cdv.finalInventory !== null && cdv.costOfSales !== null && period) {
          const generated = await cdv.generateCostOfSalesEntry();
          if (generated) {
            const { data: latestClosing } = await supabase
              .from('tab_period_inventory_closing')
              .select('journal_entry_id')
              .eq('enterprise_id', enterpriseId)
              .eq('accounting_period_id', period.id)
              .maybeSingle();
            journalEntryId = latestClosing?.journal_entry_id ?? null;
          }
        }

        if (!journalEntryId) {
          toast.error('No se pudo generar la póliza CDV. Use "Generar / Reintentar".');
          return;
        }

        const posted = await cdv.postCdvEntry();
        if (!posted) {
          toast.error('Error al contabilizar la partida de costo de ventas');
          return;
        }

        setCurrentStepIndex(nextIndex);
        await loadAccountBalances();
      } finally {
        setLoading(false);
      }
    } else if (currentStepId === 'generar' && canAdvance()) {
      if (!closingEntryGenerated) {
        const existingEntry = await findExistingEntry('cierre', period!.id, 'CIER');
        if (existingEntry) {
          setClosingEntryGenerated(true);
          setClosingEntryId(existingEntry.id);
          setClosingEntryNumber(existingEntry.entry_number);
          setClosingEntryStatus(existingEntry.status);
          setCurrentStepIndex(nextIndex);
          return;
        }
        await generateClosingEntry();
        return;
      }
      setCurrentStepIndex(nextIndex);
    } else if (currentStepId === 'traslado' && canAdvance()) {
      if (!transferEntryGenerated && config?.retained_earnings_account_id) {
        await generateTransferEntry();
        return;
      }
      setCurrentStepIndex(nextIndex);
    } else if (currentStepId === 'apertura' && canAdvance()) {
      if (!openingEntryGenerated) {
        await generateOpeningEntry();
        return;
      }
      setCurrentStepIndex(nextIndex);
      await loadBalanceVerification();
    } else if (currentStepId === 'verificar') {
      setCurrentStepIndex(nextIndex);
    } else if (currentStepId === 'confirmar' && canAdvance()) {
      await handleClosePeriod();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ'
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr + 'T00:00:00'), 'dd/MM/yyyy', { locale: es });
  };

  if (!period) return null;

  const isLastStep = currentStepIndex === steps.length - 1;

  // ---- Render helpers ----
  const renderEntryStatusBadge = (status: string | null, number: string | null) => {
    if (!status) return null;
    if (status === 'no_requerido') {
      return (
        <Card className="border-muted bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-muted-foreground">
              <CheckCircle2 className="h-6 w-6" />
              <p className="font-medium">No se requiere esta partida (monto cero)</p>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-6 w-6" />
            <div>
              <p className="font-medium">
                {status === 'contabilizado' ? 'Partida contabilizada' : 'Partida generada'}
              </p>
              <p className="text-sm text-green-600 dark:text-green-500">
                {number
                  ? `Póliza ${number} — ${status === 'contabilizado' ? 'contabilizada' : 'borrador, se contabilizará al confirmar el cierre'}`
                  : 'Generada como borrador.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Asistente de Cierre - Período {period.year}
          </DialogTitle>
          <DialogDescription>
            {format(new Date(period.start_date + 'T00:00:00'), 'dd MMM yyyy', { locale: es })} - {format(new Date(period.end_date + 'T00:00:00'), 'dd MMM yyyy', { locale: es })}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-between px-2 py-3 border-b bg-muted/30 rounded-lg overflow-x-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStepIndex === index;
            const isCompleted = currentStepIndex > index;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                    isCompleted && "bg-primary border-primary text-primary-foreground",
                    isActive && "border-primary text-primary bg-primary/10",
                    !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] mt-1 font-medium whitespace-nowrap",
                    isActive && "text-primary",
                    !isActive && !isCompleted && "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={cn(
                    "w-6 h-0.5 mx-1",
                    isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-1">
          <div className="py-4">
            {/* Step: Pending Entries */}
            {currentStepId === 'partidas' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <FileText className="h-5 w-5" />
                  Revisar Partidas Pendientes
                </div>
                
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingEntries.length === 0 ? (
                  <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-6 w-6" />
                        <div>
                          <p className="font-medium">No hay partidas pendientes</p>
                          <p className="text-sm text-green-600 dark:text-green-500">
                            Todas las partidas del período están contabilizadas.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-6 w-6" />
                          <div>
                            <p className="font-medium">
                              {pendingEntries.length} partida{pendingEntries.length !== 1 ? 's' : ''} pendiente{pendingEntries.length !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm text-amber-600 dark:text-amber-500">
                              Se recomienda contabilizar o eliminar estas partidas antes de cerrar.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingEntries.map(entry => (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-sm">{entry.entry_number}</TableCell>
                            <TableCell>{formatDate(entry.entry_date)}</TableCell>
                            <TableCell className="max-w-[250px]"><TruncatedText text={entry.description} inline /></TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="capitalize">
                                {entry.status === 'borrador' ? 'Borrador' : 'Pendiente'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(entry.total_debit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/50">
                      <Checkbox
                        id="continue-pending"
                        checked={continueDespitePending}
                        onCheckedChange={(checked) => setContinueDespitePending(checked === true)}
                      />
                      <Label htmlFor="continue-pending" className="text-sm cursor-pointer">
                        Entiendo el riesgo y deseo continuar con partidas pendientes
                      </Label>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Step: Cost of Sales (CDV) */}
            {currentStepId === 'cdv' && (
              <div className="space-y-4">
                {cdv.closingData?.status === 'contabilizado' && cdv.closingData?.journal_entry_id && (
                  <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <AlertDescription className="text-green-700 dark:text-green-400">
                      La partida de Costo de Ventas ya fue generada y contabilizada.
                    </AlertDescription>
                  </Alert>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Cálculo de Costo de Ventas por Coeficiente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(!config?.inventory_account_id || !config?.purchases_account_id || !config?.cost_of_sales_account_id) && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Faltan cuentas configuradas. Vaya a Configuración → Cuentas Especiales para configurar:
                          {!config?.inventory_account_id && ' Inventario de Mercaderías,'}
                          {!config?.purchases_account_id && ' Compras,'}
                          {!config?.cost_of_sales_account_id && ' Cuenta de Costo de Ventas.'}
                        </AlertDescription>
                      </Alert>
                    )}

                    {cdv.needsRecalculation && (
                      <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="flex items-center justify-between">
                          <span>Los saldos han cambiado desde el último cálculo. Se recomienda recalcular.</span>
                          <Button variant="outline" size="sm" onClick={cdv.refreshCalculation} disabled={cdv.loading}>
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Recalcular
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}

                    {cdv.loading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Concepto</TableHead>
                              <TableHead className="text-right">Monto</TableHead>
                              <TableHead>Estado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell>Inventario Inicial de Mercaderías</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(cdv.initialInventory)}</TableCell>
                              <TableCell><Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">✅ Calculado</Badge></TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>(+) Compras del Período</TableCell>
                              <TableCell className="text-right font-mono">{formatCurrency(cdv.purchasesAmount)}</TableCell>
                              <TableCell><Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">✅ Calculado</Badge></TableCell>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                              <TableCell className="font-semibold">(=) Mercadería Disponible para Venta</TableCell>
                              <TableCell className="text-right font-mono font-semibold">{formatCurrency(cdv.initialInventory + cdv.purchasesAmount)}</TableCell>
                              <TableCell><Badge variant="outline">Subtotal</Badge></TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell>(-) Inventario Final de Mercaderías</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center gap-2 justify-end">
                                  {cdv.closingData?.status === 'contabilizado' ? (
                                    <span className="font-mono">{cdv.finalInventory !== null ? formatCurrency(cdv.finalInventory) : '—'}</span>
                                  ) : (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      defaultValue={cdv.finalInventory ?? ''}
                                      onBlur={(e) => {
                                        const val = e.target.value;
                                        if (val === '') return;
                                        const num = parseFloat(val);
                                        if (!isNaN(num)) cdv.saveFinalInventory(num);
                                      }}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                      placeholder="Ingrese conteo físico"
                                      className="w-48 text-right font-mono ml-auto"
                                    />
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {cdv.finalInventory !== null ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">✅ Ingresado</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400">⚠️ Pendiente</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                            <TableRow className="border-t-2 font-bold">
                              <TableCell className="text-base">(=) COSTO DE VENTAS</TableCell>
                              <TableCell className="text-right font-mono text-lg">{cdv.costOfSales !== null ? formatCurrency(cdv.costOfSales) : '—'}</TableCell>
                              <TableCell>
                                {cdv.costOfSales !== null ? (
                                  cdv.costOfSales < 0 ? <Badge variant="destructive">⚠️ Negativo</Badge> :
                                  <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">✅ Calculado</Badge>
                                ) : <Badge variant="secondary">Pendiente</Badge>}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>

                        {cdv.costOfSales !== null && cdv.costOfSales < 0 && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              El costo de ventas es negativo. Verifique los montos antes de continuar.
                            </AlertDescription>
                          </Alert>
                        )}

                        {/* Projected Financial Result */}
                        {cdv.costOfSales !== null && (
                          <Card className="border-primary/20 bg-primary/5">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Scale className="h-4 w-4" />
                                Resultado Financiero Proyectado
                              </CardTitle>
                              <p className="text-xs text-muted-foreground">Informativo — no genera partidas contables</p>
                            </CardHeader>
                            <CardContent>
                              {(() => {
                                const sales = cdv.totalSales;
                                const cos = cdv.costOfSales ?? 0;
                                const grossProfit = sales - cos;
                                const grossMargin = sales !== 0 ? (grossProfit / sales) * 100 : 0;
                                return (
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Ventas del Período</p>
                                      <p className="text-lg font-bold font-mono">{formatCurrency(sales)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Costo de Ventas Est.</p>
                                      <p className="text-lg font-bold font-mono">{formatCurrency(cos)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Utilidad Bruta Est.</p>
                                      <p className={cn(
                                        "text-lg font-bold font-mono",
                                        grossProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                      )}>
                                        {formatCurrency(grossProfit)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-muted-foreground">Margen Bruto</p>
                                      <p className={cn(
                                        "text-lg font-bold font-mono",
                                        grossMargin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                                      )}>
                                        {grossMargin.toFixed(1)}%
                                      </p>
                                    </div>
                                  </div>
                                );
                              })()}
                            </CardContent>
                          </Card>
                        )}

                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            El inventario final debe corresponder al conteo físico de mercaderías al cierre del período.
                          </AlertDescription>
                        </Alert>

                        {cdv.error && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{cdv.error}</AlertDescription>
                          </Alert>
                        )}

                        {cdv.closingData?.status !== 'contabilizado' && (
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={cdv.refreshCalculation} disabled={cdv.loading}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Recalcular
                            </Button>
                            {cdv.closingData?.journal_entry_id ? (
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400">
                                  Partida CDV generada
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    if (cdv.closingData?.journal_entry_id) {
                                      try {
                                        const { data: existingEntry } = await supabase
                                          .from('tab_journal_entries')
                                          .select('id, status')
                                          .eq('id', cdv.closingData.journal_entry_id)
                                          .single();
                                        if (existingEntry && existingEntry.status === 'borrador') {
                                          await supabase.from('tab_journal_entry_details').delete().eq('journal_entry_id', existingEntry.id);
                                          await supabase.from('tab_journal_entries').delete().eq('id', existingEntry.id);
                                        }
                                        await supabase
                                          .from('tab_period_inventory_closing')
                                          .update({ journal_entry_id: null, updated_at: new Date().toISOString() })
                                          .eq('id', cdv.closingData.id);
                                        cdv.calculate();
                                        toast.success('Partida CDV eliminada. Puede regenerar.');
                                      } catch (e: any) {
                                        toast.error('Error al eliminar partida CDV');
                                      }
                                    }
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  Regenerar
                                </Button>
                              </div>
                            ) : (
                              <Button
                                onClick={cdv.generateCostOfSalesEntry}
                                disabled={cdv.loading || cdv.finalInventory === null || cdv.costOfSales === null || !config?.inventory_account_id || !config?.purchases_account_id || !config?.cost_of_sales_account_id}
                              >
                                <Calculator className="h-4 w-4 mr-2" />
                                Generar / Reintentar Partida CDV
                              </Button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step: Generate Closing Entry */}
            {currentStepId === 'generar' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <Calculator className="h-5 w-5" />
                  Cierre de Cuentas de Resultado
                </div>

                {!config?.period_result_account_id ? (
                  <Card className="border-destructive bg-destructive/10">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3 text-destructive">
                        <AlertCircle className="h-6 w-6" />
                        <div>
                          <p className="font-medium">Cuenta de Resultado no configurada</p>
                          <p className="text-sm">
                            Debe configurar la cuenta de Resultado del Período en Configuración → Cuentas Especiales.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span>Cuentas de Ingreso</span>
                            <Badge variant="outline" className="font-mono">{formatCurrency(totalIncome)}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {incomeAccounts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay ingresos en el período</p>
                          ) : (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {incomeAccounts.map(acc => (
                                <div key={acc.account_id} className="flex justify-between text-sm">
                                  <span className="truncate">{acc.account_code} - {acc.account_name}</span>
                                  <span className="font-mono ml-2">{formatCurrency(Math.abs(acc.balance))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span>Cuentas de Gasto</span>
                            <Badge variant="outline" className="font-mono">{formatCurrency(totalExpenses)}</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {expenseAccounts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay gastos en el período</p>
                          ) : (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {expenseAccounts.map(acc => (
                                <div key={acc.account_id} className="flex justify-between text-sm">
                                  <span className="truncate">{acc.account_code} - {acc.account_name}</span>
                                  <span className="font-mono ml-2">{formatCurrency(Math.abs(acc.balance))}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <Separator />

                    <Card className={cn(
                      periodResult >= 0 
                        ? "border-green-200 bg-green-50 dark:bg-green-950/20" 
                        : "border-red-200 bg-red-50 dark:bg-red-950/20"
                    )}>
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-sm text-muted-foreground">Total Ingresos</p>
                            <p className="text-xl font-bold font-mono">{formatCurrency(totalIncome)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Total Gastos</p>
                            <p className="text-xl font-bold font-mono">{formatCurrency(totalExpenses)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {periodResult >= 0 ? 'Utilidad' : 'Pérdida'}
                            </p>
                            <p className={cn(
                              "text-xl font-bold font-mono",
                              periodResult >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {formatCurrency(Math.abs(periodResult))}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {closingEntryGenerated ? (
                      renderEntryStatusBadge(closingEntryStatus, closingEntryNumber)
                    ) : (
                      <div className="flex justify-center">
                        <Button 
                          onClick={generateClosingEntry} 
                          disabled={loading || (incomeAccounts.length === 0 && expenseAccounts.length === 0)}
                          size="lg"
                        >
                          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Generar Partida de Cierre
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Step: Transfer to Equity */}
            {currentStepId === 'traslado' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <ArrowRightLeft className="h-5 w-5" />
                  Traslado a Utilidades Acumuladas
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Este paso traslada el saldo de la cuenta <strong>"Resultado del Período"</strong> a la cuenta <strong>"Utilidades Acumuladas"</strong> en el patrimonio, 
                    dejando la cuenta de resultado en cero para el próximo ejercicio.
                  </AlertDescription>
                </Alert>

                {!config?.retained_earnings_account_id ? (
                  <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-6 w-6" />
                        <div>
                          <p className="font-medium">Cuenta de Utilidades Acumuladas no configurada</p>
                          <p className="text-sm text-amber-600 dark:text-amber-500">
                            Configure la cuenta en Configuración → Cuentas Especiales. 
                            Puede omitir este paso y configurarla después.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card>
                      <CardContent className="pt-6">
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {periodResult >= 0 ? 'Utilidad a trasladar' : 'Pérdida a trasladar'}
                            </p>
                            <p className={cn(
                              "text-2xl font-bold font-mono",
                              periodResult >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              {formatCurrency(Math.abs(periodResult))}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Destino</p>
                            <p className="text-lg font-medium">Utilidades Acumuladas</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {transferEntryGenerated ? (
                      renderEntryStatusBadge(transferEntryStatus, transferEntryNumber)
                    ) : (
                      <div className="flex justify-center">
                        <Button onClick={generateTransferEntry} disabled={loading} size="lg">
                          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Generar Partida de Traslado
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Step: Opening Balance */}
            {currentStepId === 'apertura' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <BookOpen className="h-5 w-5" />
                  Partida de Apertura — {period.year + 1}
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Se generará una partida con los saldos finales de todas las cuentas de balance 
                    (Activo, Pasivo, Capital) al {formatDate(period.end_date)}, como saldos iniciales del período {period.year + 1}.
                  </AlertDescription>
                </Alert>

                {openingEntryGenerated ? (
                  <>
                    {renderEntryStatusBadge(openingEntryStatus, openingEntryNumber)}
                    {openingBalanceAccounts.length > 0 && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">Cuentas incluidas en la apertura</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                            {openingBalanceAccounts.map(acc => (
                              <div key={acc.account_id} className="flex justify-between text-sm">
                                <span className="truncate">{acc.account_code} - {acc.account_name}</span>
                                <span className={cn(
                                  "font-mono ml-2",
                                  acc.balance >= 0 ? "text-foreground" : "text-destructive"
                                )}>
                                  {acc.balance >= 0 ? 'D ' : 'C '}{formatCurrency(Math.abs(acc.balance))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : (
                  <div className="flex justify-center">
                    <Button onClick={generateOpeningEntry} disabled={loading} size="lg">
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Generar Partida de Apertura {period.year + 1}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Step: Balance Verification */}
            {currentStepId === 'verificar' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <Scale className="h-5 w-5" />
                  Verificar Balances
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <p className="text-sm text-muted-foreground">Total Activos</p>
                          <p className="text-2xl font-bold font-mono">{formatCurrency(totalAssets)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <p className="text-sm text-muted-foreground">Total Pasivos</p>
                          <p className="text-2xl font-bold font-mono">{formatCurrency(totalLiabilities)}</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <p className="text-sm text-muted-foreground">Total Capital</p>
                          <p className="text-2xl font-bold font-mono">{formatCurrency(totalEquity)}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <Separator />

                    <Card className={cn(
                      isBalanced 
                        ? "border-green-200 bg-green-50 dark:bg-green-950/20" 
                        : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"
                    )}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isBalanced ? (
                              <CheckCircle2 className="h-6 w-6 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-6 w-6 text-amber-600" />
                            )}
                            <div>
                              <p className="font-medium">Ecuación Contable</p>
                              <p className="text-sm text-muted-foreground">Activo = Pasivo + Capital</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-mono">
                              {formatCurrency(totalAssets)} = {formatCurrency(totalLiabilities + totalEquity)}
                            </p>
                            {isBalanced ? (
                              <Badge variant="default" className="bg-green-600">Cuadrado</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-500">
                                Diferencia: {formatCurrency(Math.abs(totalAssets - (totalLiabilities + totalEquity)))}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            )}

            {/* Step: Confirmation */}
            {currentStepId === 'confirmar' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <Lock className="h-5 w-5" />
                  Confirmar Cierre del Período
                </div>

                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span>Partida de cierre de resultados generada</span>
                    </div>
                    {hasCdvStep && (
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span>Costo de ventas calculado y contabilizado</span>
                      </div>
                    )}
                    {transferEntryGenerated && transferEntryStatus !== 'no_requerido' && (
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span>Resultado trasladado a utilidades acumuladas</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span>Partida de apertura {period.year + 1} generada</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span>Balance verificado</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span>
                        Resultado del período: {' '}
                        <span className={cn(
                          "font-bold",
                          periodResult >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {periodResult >= 0 ? 'Utilidad' : 'Pérdida'} de {formatCurrency(Math.abs(periodResult))}
                        </span>
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-6 w-6 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-700 dark:text-amber-400">
                          Acción importante
                        </p>
                        <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
                          Al confirmar, todas las partidas (cierre, traslado y apertura) serán contabilizadas 
                          y el período será marcado como cerrado. Podrá reabrir el período si es necesario.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex items-center space-x-2 p-4 border rounded-lg">
                  <Checkbox
                    id="confirm-close"
                    checked={confirmClose}
                    onCheckedChange={(checked) => setConfirmClose(checked === true)}
                  />
                  <Label htmlFor="confirm-close" className="text-sm cursor-pointer">
                    Entiendo y deseo cerrar el período, contabilizar todas las partidas generadas
                  </Label>
                </div>
              </div>
            )}

            {/* Step: Completed */}
            {currentStepId === 'completado' && (
              <div className="flex flex-col items-center justify-center py-12 space-y-6">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold">¡Período Cerrado!</h3>
                  <p className="text-muted-foreground mt-2">
                    El período {period.year} ha sido cerrado exitosamente.
                  </p>
                  <div className="text-sm text-muted-foreground mt-3 space-y-1">
                    {closingEntryNumber && <p>✅ Cierre de resultados: <span className="font-mono">{closingEntryNumber}</span></p>}
                    {transferEntryNumber && <p>✅ Traslado a utilidades: <span className="font-mono">{transferEntryNumber}</span></p>}
                    {openingEntryNumber && <p>✅ Apertura {period.year + 1}: <span className="font-mono">{openingEntryNumber}</span></p>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => onOpenChange(false)}>
                    Cerrar
                  </Button>
                  <Button onClick={() => {
                    onSuccess();
                    onOpenChange(false);
                  }}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Finalizar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer with navigation buttons */}
        {!isLastStep && (
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStepIndex === 0 || loading}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Anterior
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canAdvance() || loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {currentStepId === 'confirmar' ? (
                <>
                  <Lock className="mr-2 h-4 w-4" />
                  Cerrar Período
                </>
              ) : (
                <>
                  Siguiente
                  <ChevronRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

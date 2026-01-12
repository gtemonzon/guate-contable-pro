import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
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
  AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useEnterpriseConfig } from '@/hooks/useEnterpriseConfig';
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

interface PeriodClosingWizardProps {
  open: boolean;
  period: Period | null;
  enterpriseId: number;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const STEPS = [
  { id: 1, title: 'Partidas', icon: FileText, description: 'Revisar pendientes' },
  { id: 2, title: 'Generar', icon: Calculator, description: 'Partida de cierre' },
  { id: 3, title: 'Verificar', icon: Scale, description: 'Balances' },
  { id: 4, title: 'Confirmar', icon: Lock, description: 'Cierre' },
  { id: 5, title: 'Completado', icon: PartyPopper, description: '' },
];

export function PeriodClosingWizard({ 
  open, 
  period, 
  enterpriseId, 
  onOpenChange, 
  onSuccess 
}: PeriodClosingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Step 1: Pending entries
  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([]);
  const [continueDespitePending, setContinueDespitePending] = useState(false);
  
  // Step 2: Closing entry
  const [incomeAccounts, setIncomeAccounts] = useState<AccountBalance[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<AccountBalance[]>([]);
  const [closingEntryGenerated, setClosingEntryGenerated] = useState(false);
  const [closingEntryId, setClosingEntryId] = useState<number | null>(null);
  
  // Step 3: Balance verification
  const [totalAssets, setTotalAssets] = useState(0);
  const [totalLiabilities, setTotalLiabilities] = useState(0);
  const [totalEquity, setTotalEquity] = useState(0);
  const [isBalanced, setIsBalanced] = useState(false);
  
  // Step 4: Confirmation
  const [confirmClose, setConfirmClose] = useState(false);
  
  const { config } = useEnterpriseConfig(enterpriseId);
  
  const totalIncome = incomeAccounts.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
  const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
  const periodResult = totalIncome - totalExpenses;

  // Reset state when dialog opens
  useEffect(() => {
    if (open && period) {
      setCurrentStep(1);
      setPendingEntries([]);
      setContinueDespitePending(false);
      setIncomeAccounts([]);
      setExpenseAccounts([]);
      setClosingEntryGenerated(false);
      setClosingEntryId(null);
      setTotalAssets(0);
      setTotalLiabilities(0);
      setTotalEquity(0);
      setIsBalanced(false);
      setConfirmClose(false);
      loadPendingEntries();
    }
  }, [open, period]);

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
      // Get all accounts for this enterprise (income and expense types)
      // Use lowercase variants as account_type may be stored in different cases
      const { data: accounts, error: accountsError } = await supabase
        .from('tab_accounts')
        .select('id, account_code, account_name, account_type, allows_movement')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);
      
      if (accountsError) throw accountsError;
      
      // Get all posted journal entry details for this period
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
      
      // Calculate balances per account
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
        
        // Only include detail accounts with movements that are income/expense/cost type
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

  const generateClosingEntry = async () => {
    if (!period || !config?.period_result_account_id) {
      toast.error('Falta configurar la cuenta de Resultado del Período');
      return;
    }
    
    setLoading(true);
    try {
      // Get the period result account info
      const { data: resultAccount, error: accountError } = await supabase
        .from('tab_accounts')
        .select('id, account_code, account_name')
        .eq('id', config.period_result_account_id)
        .single();
      
      if (accountError || !resultAccount) {
        throw new Error('No se encontró la cuenta de Resultado del Período');
      }
      
      // Generate entry number with CIER prefix
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
      
      // Create the closing entry
      const { data: newEntry, error: entryError } = await supabase
        .from('tab_journal_entries')
        .insert({
          enterprise_id: enterpriseId,
          accounting_period_id: period.id,
          entry_number: entryNumber,
          entry_date: period.end_date,
          entry_type: 'cierre',
          description: `Partida de cierre del período ${period.year}`,
          total_debit: Math.round((totalIncome + totalExpenses) * 100) / 100,
          total_credit: Math.round((totalIncome + totalExpenses) * 100) / 100,
          is_balanced: true,
          is_posted: false,
          status: 'borrador'
        })
        .select('id')
        .single();
      
      if (entryError) throw entryError;
      
      // Create detail lines
      const detailLines: any[] = [];
      let lineNumber = 1;
      
      // Close income accounts (debit to close credit balances)
      incomeAccounts.forEach(acc => {
        detailLines.push({
          journal_entry_id: newEntry.id,
          line_number: lineNumber++,
          account_id: acc.account_id,
          description: `Cierre ${acc.account_code} - ${acc.account_name}`,
          debit_amount: Math.abs(acc.balance),
          credit_amount: 0
        });
      });
      
      // Close expense accounts (credit to close debit balances)
      expenseAccounts.forEach(acc => {
        detailLines.push({
          journal_entry_id: newEntry.id,
          line_number: lineNumber++,
          account_id: acc.account_id,
          description: `Cierre ${acc.account_code} - ${acc.account_name}`,
          debit_amount: 0,
          credit_amount: Math.abs(acc.balance)
        });
      });
      
      // Add period result line
      if (periodResult >= 0) {
        // Profit - credit to period result
        detailLines.push({
          journal_entry_id: newEntry.id,
          line_number: lineNumber,
          account_id: config.period_result_account_id,
          description: `Utilidad del período ${period.year}`,
          debit_amount: 0,
          credit_amount: Math.abs(periodResult)
        });
      } else {
        // Loss - debit to period result
        detailLines.push({
          journal_entry_id: newEntry.id,
          line_number: lineNumber,
          account_id: config.period_result_account_id,
          description: `Pérdida del período ${period.year}`,
          debit_amount: Math.abs(periodResult),
          credit_amount: 0
        });
      }
      
      const { error: detailsError } = await supabase
        .from('tab_journal_entry_details')
        .insert(detailLines);
      
      if (detailsError) throw detailsError;
      
      setClosingEntryId(newEntry.id);
      setClosingEntryGenerated(true);
      toast.success(`Partida de cierre ${entryNumber} generada exitosamente`);
    } catch (error) {
      console.error('Error generating closing entry:', error);
      toast.error('Error al generar partida de cierre');
    } finally {
      setLoading(false);
    }
  };

  const loadBalanceVerification = useCallback(async () => {
    if (!period) return;
    
    setLoading(true);
    try {
      // Get all accounts
      const { data: accounts, error: accountsError } = await supabase
        .from('tab_accounts')
        .select('id, account_code, account_name, account_type, balance_type')
        .eq('enterprise_id', enterpriseId)
        .eq('is_active', true);
      
      if (accountsError) throw accountsError;
      
      // Get all posted journal entry details for this period
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
      
      // Calculate balances per account
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
        const balance = balanceMap.get(account.id) || 0;
        const accountTypeLower = account.account_type?.toLowerCase() || '';
        
        switch (accountTypeLower) {
          case 'activo':
            assets += balance;
            break;
          case 'pasivo':
            liabilities += Math.abs(balance);
            break;
          case 'capital':
            equity += Math.abs(balance);
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

  const handleClosePeriod = async () => {
    if (!period || !closingEntryId) return;
    
    setLoading(true);
    try {
      // 1. Post the closing entry
      const { error: postError } = await supabase
        .from('tab_journal_entries')
        .update({
          is_posted: true,
          status: 'contabilizado',
          posted_at: new Date().toISOString()
        })
        .eq('id', closingEntryId);
      
      if (postError) throw postError;
      
      // 2. Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // 3. Close the period
      const { error: closeError } = await supabase
        .from('tab_accounting_periods')
        .update({
          status: 'cerrado',
          closed_at: new Date().toISOString(),
          closed_by: user?.id
        })
        .eq('id', period.id);
      
      if (closeError) throw closeError;
      
      // 4. Clear active period if this was it
      const activePeriodId = localStorage.getItem('activePeriodId');
      if (activePeriodId === String(period.id)) {
        localStorage.removeItem('activePeriodId');
        localStorage.removeItem('activePeriodData');
        window.dispatchEvent(new CustomEvent('periodChanged'));
      }
      
      toast.success('Período cerrado exitosamente');
      setCurrentStep(5);
    } catch (error) {
      console.error('Error closing period:', error);
      toast.error('Error al cerrar el período');
    } finally {
      setLoading(false);
    }
  };

  const canAdvance = () => {
    switch (currentStep) {
      case 1:
        return pendingEntries.length === 0 || continueDespitePending;
      case 2:
        return closingEntryGenerated;
      case 3:
        return true; // Can always advance from verification
      case 4:
        return confirmClose && closingEntryId;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    if (currentStep === 1 && canAdvance()) {
      setCurrentStep(2);
      await loadAccountBalances();
    } else if (currentStep === 2 && canAdvance()) {
      setCurrentStep(3);
      await loadBalanceVerification();
    } else if (currentStep === 3) {
      setCurrentStep(4);
    } else if (currentStep === 4 && canAdvance()) {
      await handleClosePeriod();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
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
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30 rounded-lg">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            
            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                    isCompleted && "bg-primary border-primary text-primary-foreground",
                    isActive && "border-primary text-primary bg-primary/10",
                    !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs mt-1 font-medium",
                    isActive && "text-primary",
                    !isActive && !isCompleted && "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div className={cn(
                    "w-12 h-0.5 mx-2",
                    isCompleted ? "bg-primary" : "bg-muted-foreground/30"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 px-1">
          <div className="py-4">
            {/* Step 1: Pending Entries */}
            {currentStep === 1 && (
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
                            <TableCell className="max-w-[200px] truncate">{entry.description}</TableCell>
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

            {/* Step 2: Generate Closing Entry */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <Calculator className="h-5 w-5" />
                  Generar Partida de Cierre
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
                      {/* Income Accounts */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span>Cuentas de Ingreso</span>
                            <Badge variant="outline" className="font-mono">
                              {formatCurrency(totalIncome)}
                            </Badge>
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

                      {/* Expense Accounts */}
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center justify-between">
                            <span>Cuentas de Gasto</span>
                            <Badge variant="outline" className="font-mono">
                              {formatCurrency(totalExpenses)}
                            </Badge>
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

                    {/* Result Summary */}
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
                      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
                            <CheckCircle2 className="h-6 w-6" />
                            <div>
                              <p className="font-medium">Partida de cierre generada</p>
                              <p className="text-sm text-green-600 dark:text-green-500">
                                La partida ha sido creada como borrador y se contabilizará al confirmar el cierre.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="flex justify-center">
                        <Button 
                          onClick={generateClosingEntry} 
                          disabled={loading || incomeAccounts.length === 0 && expenseAccounts.length === 0}
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

            {/* Step 3: Balance Verification */}
            {currentStep === 3 && (
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
                              <p className="text-sm text-muted-foreground">
                                Activo = Pasivo + Capital
                              </p>
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

            {/* Step 4: Confirmation */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-medium">
                  <Lock className="h-5 w-5" />
                  Confirmar Cierre del Período
                </div>

                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span>Partida de cierre generada</span>
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
                          Acción irreversible
                        </p>
                        <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
                          Al cerrar el período, la partida de cierre será contabilizada y no podrá crear, 
                          editar ni eliminar partidas en este período. Podrá reabrir el período si es necesario, 
                          pero esto requiere permisos de administrador.
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
                    Entiendo que al cerrar el período no podré modificar partidas y deseo continuar
                  </Label>
                </div>
              </div>
            )}

            {/* Step 5: Completed */}
            {currentStep === 5 && (
              <div className="flex flex-col items-center justify-center py-12 space-y-6">
                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold">¡Período Cerrado!</h3>
                  <p className="text-muted-foreground mt-2">
                    El período {period.year} ha sido cerrado exitosamente.
                  </p>
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
        </ScrollArea>

        {/* Footer with navigation buttons */}
        {currentStep < 5 && (
          <div className="flex justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1 || loading}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Anterior
            </Button>
            <Button
              onClick={handleNext}
              disabled={!canAdvance() || loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {currentStep === 4 ? (
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

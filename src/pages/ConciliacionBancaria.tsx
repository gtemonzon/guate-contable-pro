/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, BadgeCheck, Building2, Calendar, Landmark, Search, Upload } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { ImportBankStatementDialog } from "@/components/conciliacion/ImportBankStatementDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuadraticReconciliationView } from "@/components/conciliacion/QuadraticReconciliationView";
import { AutoMatchPanel } from "@/components/conciliacion/AutoMatchPanel";

type Account = Database['public']['Tables']['tab_accounts']['Row'];
type BankAccount = Database['public']['Tables']['tab_bank_accounts']['Row'] & {
  account: Pick<Account, 'id' | 'account_code' | 'account_name'> | null;
};

type JournalMovement = {
  id: number;
  movement_date: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  entry_number: string;
  is_reconciled: boolean;
  reconciliation_id: number | null;
  journal_entry_id: number;
  bank_reference: string | null;
  beneficiary_name: string | null;
};

const ConciliacionBancaria = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [movements, setMovements] = useState<JournalMovement[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [availablePeriods, setAvailablePeriods] = useState<Array<{ year: string; month: string }>>([]);
  const [bankBalance, setBankBalance] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [selectedMovements, setSelectedMovements] = useState<Set<number>>(new Set());
  const [selectedEnterprise, setSelectedEnterprise] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [movementSearch, setMovementSearch] = useState("");
  type SortKey = 'movement_date' | 'description' | 'bank_reference' | 'beneficiary_name' | 'type' | 'amount';
  const [sortKey, setSortKey] = useState<SortKey>('movement_date');
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(true); }
  };

  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    let list = movements;
    if (q) {
      list = movements.filter((m) => {
        const amount = (m.debit_amount || m.credit_amount).toFixed(2);
        const type = m.debit_amount > 0 ? 'depósito deposito' : 'retiro';
        return (
          (m.description || '').toLowerCase().includes(q) ||
          (m.bank_reference || '').toLowerCase().includes(q) ||
          (m.beneficiary_name || '').toLowerCase().includes(q) ||
          amount.includes(q) ||
          type.includes(q)
        );
      });
    }
    const sorted = [...list].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      switch (sortKey) {
        case 'movement_date': av = a.movement_date; bv = b.movement_date; break;
        case 'description': av = a.description || ''; bv = b.description || ''; break;
        case 'bank_reference': av = a.bank_reference || ''; bv = b.bank_reference || ''; break;
        case 'beneficiary_name': av = a.beneficiary_name || ''; bv = b.beneficiary_name || ''; break;
        case 'type': av = a.debit_amount > 0 ? 'Depósito' : 'Retiro'; bv = b.debit_amount > 0 ? 'Depósito' : 'Retiro'; break;
        case 'amount': av = a.debit_amount || a.credit_amount; bv = b.debit_amount || b.credit_amount; break;
      }
      if (typeof av === 'number' && typeof bv === 'number') return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [movements, movementSearch, sortKey, sortAsc]);

  const allFilteredSelected = filteredMovements.length > 0 && filteredMovements.every((m) => selectedMovements.has(m.id));
  const toggleSelectAllFiltered = () => {
    setSelectedMovements((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredMovements.forEach((m) => next.delete(m.id));
      else filteredMovements.forEach((m) => next.add(m.id));
      return next;
    });
  };

  const SortButton = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${align === 'right' ? 'justify-end w-full' : ''}`}
    >
      {label}
      {sortKey === k ? (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-50" />}
    </button>
  );

  const months = [
    { value: "1", label: "Enero" },
    { value: "2", label: "Febrero" },
    { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Mayo" },
    { value: "6", label: "Junio" },
    { value: "7", label: "Julio" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  const years = Array.from(new Set(availablePeriods.map((period) => period.year)));
  const availableMonths = selectedYear
    ? months.filter((month) => availablePeriods.some((period) => period.year === selectedYear && period.month === month.value))
    : months;

  useEffect(() => {
    const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
    if (currentEnterpriseId) {
      setSelectedEnterprise(currentEnterpriseId);
      fetchBankAccounts(currentEnterpriseId);
    }
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchAvailablePeriods(selectedAccount);
    } else {
      setAvailablePeriods([]);
      setSelectedMonth("");
      setSelectedYear("");
    }
  }, [selectedAccount]);

  useEffect(() => {
    if (selectedAccount && selectedMonth && selectedYear) {
      fetchMovements();
    }
  }, [selectedAccount, selectedMonth, selectedYear]);

  const fetchBankAccounts = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from('tab_bank_accounts')
        .select(`
          *,
          account:tab_accounts(id, account_code, account_name)
        `)
        .eq('enterprise_id', parseInt(enterpriseId))
        .eq('is_active', true);

      if (error) throw error;

      const sorted = ((data || []) as unknown as BankAccount[]).sort((a, b) =>
        (a.account?.account_code || '').localeCompare(b.account?.account_code || '')
      );
      setBankAccounts(sorted);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al cargar cuentas bancarias",
        description: getSafeErrorMessage(error),
      });
    }
  };

  const fetchAvailablePeriods = async (bankAccountId: string) => {
    try {
      const selectedBankAccount = bankAccounts.find((account) => account.id.toString() === bankAccountId);
      const ledgerAccountId = selectedBankAccount?.account_id;

      if (!ledgerAccountId) {
        setAvailablePeriods([]);
        setSelectedMonth("");
        setSelectedYear("");
        return;
      }

      const { data: detailRows, error } = await supabase
        .from('tab_journal_entry_details')
        .select('journal_entry_id')
        .eq('account_id', ledgerAccountId);

      if (error) throw error;

      const entryIds = (detailRows ?? []).map((r) => r.journal_entry_id).filter(Boolean) as number[];

      let firstDate: string | null = null;
      if (entryIds.length > 0) {
        const { data: firstEntry, error: entryError } = await supabase
          .from('tab_journal_entries')
          .select('entry_date')
          .in('id', entryIds)
          .eq('is_posted', true)
          .order('entry_date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (entryError) throw entryError;
        firstDate = firstEntry?.entry_date ?? null;
      }
      if (!firstDate) {
        setAvailablePeriods([]);
        setSelectedMonth("");
        setSelectedYear("");
        return;
      }

      const start = new Date(`${firstDate}T00:00:00`);
      const end = new Date();
      const periods: Array<{ year: string; month: string }> = [];
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const last = new Date(end.getFullYear(), end.getMonth(), 1);

      while (cursor <= last) {
        periods.push({
          year: cursor.getFullYear().toString(),
          month: (cursor.getMonth() + 1).toString(),
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }

      setAvailablePeriods(periods);

      const latestPeriod = periods[periods.length - 1];
      const currentSelectionIsValid = periods.some(
        (period) => period.year === selectedYear && period.month === selectedMonth,
      );

      if (!currentSelectionIsValid && latestPeriod) {
        setSelectedYear(latestPeriod.year);
        setSelectedMonth(latestPeriod.month);
      }
    } catch (error: unknown) {
      setAvailablePeriods([]);
      toast({
        variant: "destructive",
        title: "Error al cargar períodos",
        description: getSafeErrorMessage(error),
      });
    }
  };


  const fetchMovements = async () => {
    try {
      setLoading(true);

      const selectedBankAccount = bankAccounts.find((account) => account.id.toString() === selectedAccount);
      const ledgerAccountId = selectedBankAccount?.account_id;
      if (!ledgerAccountId) {
        setMovements([]);
        return;
      }
      
      const lastDay = new Date(parseInt(selectedYear), parseInt(selectedMonth), 0).getDate();
      const endDate = `${selectedYear}-${selectedMonth.padStart(2, '0')}-${lastDay}`;
      const startDate = `${selectedYear}-${selectedMonth.padStart(2, '0')}-01`;
      
      const { data: previousUnreconciled, error: prevError } = await supabase
        .from('tab_journal_entry_details')
        .select(`
          id,
          debit_amount,
          credit_amount,
          description,
          tab_journal_entries!inner(
            id,
            entry_number,
            entry_date,
            is_posted,
            enterprise_id,
            bank_reference,
            beneficiary_name
          )
        `)
        .eq('account_id', ledgerAccountId)
        .eq('tab_journal_entries.is_posted', true)
        .lt('tab_journal_entries.entry_date', startDate);

      if (prevError) throw prevError;

      const { data: periodMovements, error: periodError } = await supabase
        .from('tab_journal_entry_details')
        .select(`
          id,
          debit_amount,
          credit_amount,
          description,
          tab_journal_entries!inner(
            id,
            entry_number,
            entry_date,
            is_posted,
            enterprise_id,
            bank_reference,
            beneficiary_name
          )
        `)
        .eq('account_id', ledgerAccountId)
        .eq('tab_journal_entries.is_posted', true)
        .gte('tab_journal_entries.entry_date', startDate)
        .lte('tab_journal_entries.entry_date', endDate);

      if (periodError) throw periodError;

      // Check which movements are reconciled in tab_bank_movements
      const allDetailIds = [
        ...(previousUnreconciled || []).map(m => m.id),
        ...(periodMovements || []).map(m => m.id)
      ];

      const reconciledMap = new Map<number, { is_reconciled: boolean; reconciliation_id: number | null }>();
      
      if (allDetailIds.length > 0) {
        const { data: bankMovements } = await supabase
          .from('tab_bank_movements')
          .select('journal_entry_id, is_reconciled, reconciliation_id')
          .in('journal_entry_id', allDetailIds);

        if (bankMovements) {
          bankMovements.forEach(bm => {
            reconciledMap.set(bm.journal_entry_id!, {
              is_reconciled: bm.is_reconciled || false,
              reconciliation_id: bm.reconciliation_id
            });
          });
        }
      }

      // Transform data to JournalMovement format
      const transformMovement = (m: any): JournalMovement => {
        const reconcilationInfo = reconciledMap.get(m.id) || { is_reconciled: false, reconciliation_id: null };
        return {
          id: m.id,
          movement_date: m.tab_journal_entries.entry_date,
          description: m.description || m.tab_journal_entries.entry_number,
          debit_amount: m.debit_amount || 0,
          credit_amount: m.credit_amount || 0,
          entry_number: m.tab_journal_entries.entry_number,
          is_reconciled: reconcilationInfo.is_reconciled,
          reconciliation_id: reconcilationInfo.reconciliation_id,
          journal_entry_id: m.id,
          bank_reference: m.tab_journal_entries.bank_reference || null,
          beneficiary_name: m.tab_journal_entries.beneficiary_name || null,
        };
      };

      // Filter previous unreconciled and combine with period movements
      const previousUnreconciledTransformed = (previousUnreconciled || [])
        .map(transformMovement)
        .filter(m => !m.is_reconciled);

      const periodMovementsTransformed = (periodMovements || [])
        .map(transformMovement);

      const allMovements = [...previousUnreconciledTransformed, ...periodMovementsTransformed];
      
      // Sort by date descending
      allMovements.sort((a, b) => 
        new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime()
      );
      
      setMovements(allMovements);
      
      // Pre-select already reconciled movements
      const reconciledIds = new Set(
        allMovements.filter(m => m.is_reconciled).map(m => m.id)
      );
      setSelectedMovements(reconciledIds);
    } catch (error: unknown) {
      console.error('Error fetching movements:', error);
      toast({
        variant: "destructive",
        title: "Error al cargar movimientos",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleMovement = (movementId: number) => {
    const newSelected = new Set(selectedMovements);
    if (newSelected.has(movementId)) {
      newSelected.delete(movementId);
    } else {
      newSelected.add(movementId);
    }
    setSelectedMovements(newSelected);
  };

  const calculateBalances = () => {
    const reconciled = movements
      .filter(m => selectedMovements.has(m.id))
      .reduce((sum, m) => sum + (m.debit_amount - m.credit_amount), 0);
    
    const pending = movements
      .filter(m => !selectedMovements.has(m.id))
      .reduce((sum, m) => sum + (m.debit_amount - m.credit_amount), 0);
    
    return { reconciled, pending };
  };

  const handleReconcile = async () => {
    if (!selectedAccount || !selectedMonth || !selectedYear || !bankBalance) {
      toast({
        variant: "destructive",
        title: "Datos incompletos",
        description: "Debes seleccionar cuenta, mes, año e ingresar el saldo bancario",
      });
      return;
    }

    try {
      setLoading(true);
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuario no autenticado");

      // Calculate book balance from selected movements
      const bookBalance = movements
        .filter(m => selectedMovements.has(m.id))
        .reduce((sum, m) => sum + (m.debit_amount - m.credit_amount), 0);

      // Create reconciliation record
      const { data: reconciliation, error: recError } = await supabase
        .from('tab_bank_reconciliations')
        .insert([{
          bank_account_id: parseInt(selectedAccount),
          reconciliation_date: new Date().toISOString().split('T')[0],
          bank_statement_balance: parseFloat(bankBalance),
          book_balance: bookBalance,
          adjustments: 0,
          reconciled_balance: bookBalance,
          status: 'conciliado',
          created_by: user.user.id,
          notes: notes || null,
        }])
        .select()
        .single();

      if (recError) throw recError;

      // Update selected movements - insert or update in tab_bank_movements
      const movementIds = Array.from(selectedMovements);
      
      // First, check which movements already have entries in tab_bank_movements
      const { data: existingBankMovements } = await supabase
        .from('tab_bank_movements')
        .select('id, journal_entry_id')
        .in('journal_entry_id', movementIds);

      const existingMap = new Map(
        (existingBankMovements || []).map(bm => [bm.journal_entry_id, bm.id])
      );

      // Separate into updates and inserts
      const toUpdate: number[] = [];
      const toInsert: any[] = [];

      movementIds.forEach(detailId => {
        const movement = movements.find(m => m.id === detailId);
        if (!movement) return;

        if (existingMap.has(detailId)) {
          toUpdate.push(existingMap.get(detailId)!);
        } else {
          toInsert.push({
            bank_account_id: parseInt(selectedAccount),
            movement_date: movement.movement_date,
            description: movement.description,
            debit_amount: movement.debit_amount,
            credit_amount: movement.credit_amount,
            journal_entry_id: detailId,
            is_reconciled: true,
            reconciliation_id: reconciliation.id
          });
        }
      });

      // Update existing
      if (toUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from('tab_bank_movements')
          .update({
            is_reconciled: true,
            reconciliation_id: reconciliation.id,
          })
          .in('id', toUpdate);

        if (updateError) throw updateError;
      }

      // Insert new
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('tab_bank_movements')
          .insert(toInsert);

        if (insertError) throw insertError;
      }

      // Update unselected movements
      const unselectedIds = movements
        .filter(m => !selectedMovements.has(m.id))
        .map(m => m.id);
      
      if (unselectedIds.length > 0) {
        // Only update those that exist in tab_bank_movements
        const { data: unselectedExisting } = await supabase
          .from('tab_bank_movements')
          .select('id')
          .in('journal_entry_id', unselectedIds);

        if (unselectedExisting && unselectedExisting.length > 0) {
          await supabase
            .from('tab_bank_movements')
            .update({
              is_reconciled: false,
              reconciliation_id: null,
            })
            .in('id', unselectedExisting.map(u => u.id));
        }
      }

      toast({
        title: "Conciliación completada",
        description: `Se conciliaron ${movementIds.length} movimientos`,
      });

      // Reset form
      setSelectedAccount("");
      setSelectedMonth("");
      setSelectedYear("");
      setBankBalance("");
      setNotes("");
      setSelectedMovements(new Set());
      setMovements([]);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al conciliar",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const balances = calculateBalances();

  if (!selectedEnterprise) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No hay empresa seleccionada</p>
          <p className="text-sm text-muted-foreground">
            Selecciona una empresa para realizar conciliaciones bancarias
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conciliación Bancaria</h1>
          <p className="text-muted-foreground">
            Concilia los movimientos bancarios con el estado de cuenta
          </p>
        </div>
        <Button onClick={() => setImportDialogOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Importar Extracto
        </Button>
      </div>

      <ImportBankStatementDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        enterpriseId={selectedEnterprise || ""}
        onImportSuccess={() => {
          if (selectedAccount && selectedMonth && selectedYear) {
            fetchMovements();
          }
        }}
      />

      <Tabs defaultValue="conciliar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="conciliar">Conciliación</TabsTrigger>
          <TabsTrigger value="auto-match">Sugerencias automáticas</TabsTrigger>
          <TabsTrigger value="cuadratica">Cuadrática SAT</TabsTrigger>
        </TabsList>

        <TabsContent value="auto-match">
          <AutoMatchPanel
            enterpriseId={parseInt(selectedEnterprise)}
            bankAccountId={selectedAccount ? parseInt(selectedAccount) : null}
            year={selectedYear ? parseInt(selectedYear) : null}
            month={selectedMonth ? parseInt(selectedMonth) : null}
            onApplied={() => { if (selectedAccount && selectedMonth && selectedYear) fetchMovements(); }}
          />
        </TabsContent>

        <TabsContent value="cuadratica">
          <QuadraticReconciliationView enterpriseId={parseInt(selectedEnterprise)} />
        </TabsContent>

        <TabsContent value="conciliar" className="space-y-6">

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Cuenta Bancaria
            </CardTitle>
            <CardDescription>Selecciona la cuenta a conciliar</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una cuenta bancaria" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.account?.account_code || account.bank_name} - {account.account?.account_name || account.account_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Período de Conciliación
            </CardTitle>
            <CardDescription>Selecciona mes y año a conciliar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Mes</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un mes" />
                </SelectTrigger>
                <SelectContent>
                  {availableMonths.map((month) => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Año</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un año" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedAccount && selectedMonth && selectedYear && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Saldo del Estado de Cuenta</CardTitle>
              <CardDescription>Ingresa el saldo que aparece en tu estado de cuenta bancario</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="bank-balance">Saldo Bancario</Label>
                <Input
                  id="bank-balance"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={bankBalance}
                  onChange={(e) => setBankBalance(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Input
                  id="notes"
                  placeholder="Observaciones sobre la conciliación"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Movimientos Bancarios</CardTitle>
              <CardDescription>
                Marca los movimientos que aparecen en el estado de cuenta
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : movements.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No hay movimientos para este período
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative w-full sm:max-w-sm">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por descripción, ref., beneficiario, monto o tipo..."
                        value={movementSearch}
                        onChange={(e) => setMovementSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{filteredMovements.length} de {movements.length}</span>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allFilteredSelected}
                            onCheckedChange={toggleSelectAllFiltered}
                            aria-label="Seleccionar todo"
                          />
                        </TableHead>
                        <TableHead><SortButton k="movement_date" label="Fecha" /></TableHead>
                        <TableHead><SortButton k="description" label="Descripción" /></TableHead>
                        <TableHead><SortButton k="bank_reference" label="Ref. Bancaria" /></TableHead>
                        <TableHead><SortButton k="beneficiary_name" label="Beneficiario" /></TableHead>
                        <TableHead><SortButton k="type" label="Tipo" /></TableHead>
                        <TableHead className="text-right"><SortButton k="amount" label="Monto" align="right" /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMovements.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No se encontraron movimientos con ese criterio
                          </TableCell>
                        </TableRow>
                      ) : filteredMovements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedMovements.has(movement.id)}
                              onCheckedChange={() => toggleMovement(movement.id)}
                            />
                          </TableCell>
                          <TableCell>
                            {new Date(movement.movement_date).toLocaleDateString()}
                            <div className="text-xs text-muted-foreground">{movement.entry_number}</div>
                          </TableCell>
                          <TableCell>{movement.description}</TableCell>
                          <TableCell className="text-sm">
                            {movement.bank_reference || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-sm">
                            {movement.beneficiary_name || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell>
                            <span className={`text-sm ${movement.debit_amount > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                              {movement.debit_amount > 0 ? 'Depósito' : 'Retiro'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            Q {(movement.debit_amount || movement.credit_amount).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <div className="grid gap-4 md:grid-cols-3 pt-4 border-t">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Movimientos Conciliados</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">Q {balances.reconciled.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedMovements.size} movimientos
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Movimientos Pendientes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">Q {balances.pending.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {movements.length - selectedMovements.size} movimientos
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">Diferencia</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl font-bold ${Math.abs(balances.reconciled - parseFloat(bankBalance || '0')) < 0.01 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          Q {(balances.reconciled - parseFloat(bankBalance || '0')).toFixed(2)}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          vs. Saldo bancario
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button onClick={handleReconcile} disabled={loading || !bankBalance}>
                      <BadgeCheck className="mr-2 h-4 w-4" />
                      Guardar Conciliación
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConciliacionBancaria;

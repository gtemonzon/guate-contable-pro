import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { MonthlyBalanceTreeView } from "@/components/balance/MonthlyBalanceTreeView";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { Check, ChevronsUpDown, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  balance_type: string;
  level: number;
  parent_account_id: number | null;
  allows_movement: boolean | null;
}

interface MonthlyAccount extends Account {
  initial_balance: number;
  debit: number;
  credit: number;
  movement: number;
  final_balance: number;
  /** Movimiento neto (debe - haber con signo según naturaleza) por cada mes seleccionado. Key = número de mes (1-12). */
  monthly_movements: Record<number, { debit: number; credit: number; net: number }>;
}

interface AccountPeriod {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

export default function SaldosMensuales() {
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [monthlyAccounts, setMonthlyAccounts] = useState<MonthlyAccount[]>([]);
  const [periods, setPeriods] = useState<AccountPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [accountsPopoverOpen, setAccountsPopoverOpen] = useState(false);
  const [monthsPopoverOpen, setMonthsPopoverOpen] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  const selectedPeriodData = useMemo(() => {
    return periods.find(p => p.id === parseInt(selectedPeriod));
  }, [periods, selectedPeriod]);

  const totals = useMemo(() => {
    const detailAccounts = monthlyAccounts.filter(acc => {
      const hasChildren = monthlyAccounts.some(child => child.parent_account_id === acc.id);
      return !hasChildren;
    });
    
    const totalDebit = detailAccounts.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredit = detailAccounts.reduce((sum, acc) => sum + acc.credit, 0);
    
    return {
      totalDebit: formatCurrency(totalDebit),
      totalCredit: formatCurrency(totalCredit),
    };
  }, [monthlyAccounts]);

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchInitialData(enterpriseId);
    } else {
      setLoading(false);
      toast({
        title: "Selecciona una empresa",
        description: "Debes seleccionar una empresa primero",
        variant: "destructive",
      });
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchInitialData(newEnterpriseId);
      } else {
        setAllAccounts([]);
        setMonthlyAccounts([]);
        setPeriods([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleStorageChange);
    };
  }, []);

  const fetchInitialData = async (enterpriseId: string) => {
    try {
      setLoading(true);
      
      // Fetch periods and accounts in parallel
      const [periodsResult, accountsResult] = await Promise.all([
        supabase
          .from("tab_accounting_periods")
          .select("*")
          .eq("enterprise_id", parseInt(enterpriseId))
          .order("year", { ascending: false }),
        supabase
          .from("tab_accounts")
          .select("*")
          .eq("enterprise_id", parseInt(enterpriseId))
          .eq("is_active", true)
          .order("account_code")
      ]);

      if (periodsResult.error) throw periodsResult.error;
      if (accountsResult.error) throw accountsResult.error;
      
      setPeriods(periodsResult.data || []);
      setAllAccounts(accountsResult.data || []);
      
      // Auto-select open period
      if (periodsResult.data && periodsResult.data.length > 0) {
        const openPeriod = periodsResult.data.find(p => p.status === "abierto");
        const defaultPeriod = openPeriod || periodsResult.data[0];
        setSelectedPeriod(String(defaultPeriod.id));
      }
    } catch (error: unknown) {
      toast({
        title: "Error al cargar datos",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMonthToggle = (month: number) => {
    if (selectedMonths.length === 0) {
      setSelectedMonths([month]);
      return;
    }
    
    const min = Math.min(...selectedMonths);
    const max = Math.max(...selectedMonths);
    
    if (selectedMonths.includes(month)) {
      // Allow removing only from extremes
      if (month === min || month === max) {
        setSelectedMonths(selectedMonths.filter(m => m !== month));
      }
    } else if (month === min - 1 || month === max + 1) {
      // Allow adding only adjacent months
      setSelectedMonths([...selectedMonths, month].sort((a, b) => a - b));
    } else {
      // If not consecutive, restart selection
      setSelectedMonths([month]);
    }
  };

  const handleAccountToggle = (accountId: number) => {
    setSelectedAccounts(prev => 
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccounts.length === allAccounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(allAccounts.map(a => a.id));
    }
  };

  const calculateDateRange = () => {
    if (!selectedPeriodData || selectedMonths.length === 0) return null;
    
    const year = selectedPeriodData.year;
    const minMonth = Math.min(...selectedMonths);
    const maxMonth = Math.max(...selectedMonths);
    
    // Start date: first day of first selected month
    const startDate = `${year}-${String(minMonth).padStart(2, '0')}-01`;
    
    // End date: last day of last selected month
    const lastDay = new Date(year, maxMonth, 0).getDate();
    const endDate = `${year}-${String(maxMonth).padStart(2, '0')}-${lastDay}`;
    
    // Initial balance cut-off: day before startDate
    let initialBalanceEndDate: string | null = null;
    if (minMonth === 1) {
      // If January, initial balance comes from period start (no previous balance within this period)
      initialBalanceEndDate = null;
    } else {
      const lastDayOfPreviousMonth = new Date(year, minMonth - 1, 0);
      initialBalanceEndDate = lastDayOfPreviousMonth.toISOString().split('T')[0];
    }
    
    return { startDate, endDate, initialBalanceEndDate };
  };

  const handleQuery = async () => {
    if (!currentEnterpriseId || !selectedPeriod || selectedMonths.length === 0) {
      toast({
        title: "Datos incompletos",
        description: "Selecciona un período y al menos un mes",
        variant: "destructive",
      });
      return;
    }

    const dateRange = calculateDateRange();
    if (!dateRange) return;

    try {
      setQuerying(true);
      const periodId = parseInt(selectedPeriod);
      
      // Always query the FULL chart of accounts so the tree shows all branches.
      // The selectedAccounts filter is intentionally ignored for tree rendering
      // (totals computed at the end already work correctly across the full tree).
      const accountsToQuery = allAccounts;

      // Fetch movements within selected months (excluding opening entries)
      const entries = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entries")
          .select(`
            id,
            entry_date,
            entry_type,
            tab_journal_entry_details (
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("accounting_period_id", periodId)
          .eq("is_posted", true)
          .neq("entry_type", "apertura")
          .gte("entry_date", dateRange.startDate)
          .lte("entry_date", dateRange.endDate)
      );

      // Fetch previous balance entries:
      // 1. All entries before startDate (if not January)
      // 2. Opening entries ("apertura") always count as initial balance
      let prevEntries: any[] = [];
      
      // Always fetch opening entries as they're part of initial balance
      const openingEntries = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entries")
          .select(`
            id,
            entry_date,
            entry_type,
            tab_journal_entry_details (
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("accounting_period_id", periodId)
          .eq("is_posted", true)
          .eq("entry_type", "apertura")
      );
      
      prevEntries = [...openingEntries];
      
      // Also fetch non-opening entries before the selected start date
      if (dateRange.initialBalanceEndDate) {
        const priorEntries = await fetchAllRecords<any>(
          supabase
            .from("tab_journal_entries")
            .select(`
              id,
              entry_date,
              entry_type,
              tab_journal_entry_details (
                account_id,
                debit_amount,
                credit_amount
              )
            `)
            .eq("enterprise_id", parseInt(currentEnterpriseId))
            .eq("accounting_period_id", periodId)
            .eq("is_posted", true)
            .neq("entry_type", "apertura")
            .gte("entry_date", selectedPeriodData!.start_date)
            .lte("entry_date", dateRange.initialBalanceEndDate)
        );
        prevEntries = [...prevEntries, ...priorEntries];
      }

      // Calculate previous balances by detail account
      const previousBalances: Record<number, { debit: number; credit: number }> = {};
      prevEntries?.forEach((entry: any) => {
        entry.tab_journal_entry_details?.forEach((detail: any) => {
          if (!previousBalances[detail.account_id]) {
            previousBalances[detail.account_id] = { debit: 0, credit: 0 };
          }
          previousBalances[detail.account_id].debit += detail.debit_amount || 0;
          previousBalances[detail.account_id].credit += detail.credit_amount || 0;
        });
      });

      // Calculate current period balances + per-month breakdown
      const currentBalances: Record<number, { debit: number; credit: number }> = {};
      const monthlyBreakdown: Record<number, Record<number, { debit: number; credit: number }>> = {};

      entries?.forEach((entry: any) => {
        const month = new Date(entry.entry_date + "T00:00:00").getMonth() + 1;
        entry.tab_journal_entry_details?.forEach((detail: any) => {
          if (!currentBalances[detail.account_id]) {
            currentBalances[detail.account_id] = { debit: 0, credit: 0 };
          }
          currentBalances[detail.account_id].debit += detail.debit_amount || 0;
          currentBalances[detail.account_id].credit += detail.credit_amount || 0;

          if (!monthlyBreakdown[detail.account_id]) {
            monthlyBreakdown[detail.account_id] = {};
          }
          if (!monthlyBreakdown[detail.account_id][month]) {
            monthlyBreakdown[detail.account_id][month] = { debit: 0, credit: 0 };
          }
          monthlyBreakdown[detail.account_id][month].debit += detail.debit_amount || 0;
          monthlyBreakdown[detail.account_id][month].credit += detail.credit_amount || 0;
        });
      });

      // Create account map (include monthly breakdown so it propagates up the tree)
      const accountMap: Record<number, any> = {};
      accountsToQuery.forEach((account: any) => {
        const prevBal = previousBalances[account.id] || { debit: 0, credit: 0 };
        const currBal = currentBalances[account.id] || { debit: 0, credit: 0 };
        const monthly: Record<number, { debit: number; credit: number }> = {};
        // initialize monthly buckets for all selected months (so parents always have keys)
        selectedMonths.forEach((m) => {
          const src = monthlyBreakdown[account.id]?.[m];
          monthly[m] = { debit: src?.debit ?? 0, credit: src?.credit ?? 0 };
        });
        accountMap[account.id] = {
          ...account,
          prev_debit: prevBal.debit,
          prev_credit: prevBal.credit,
          debit: currBal.debit,
          credit: currBal.credit,
          monthly,
        };
      });

      // Propagate balances up the hierarchy
      const sortedAccounts = [...accountsToQuery].sort((a, b) => b.level - a.level);
      
      sortedAccounts.forEach((account: any) => {
        const currentAccount = accountMap[account.id];
        if (account.parent_account_id && accountMap[account.parent_account_id]) {
          accountMap[account.parent_account_id].prev_debit += currentAccount.prev_debit;
          accountMap[account.parent_account_id].prev_credit += currentAccount.prev_credit;
          accountMap[account.parent_account_id].debit += currentAccount.debit;
          accountMap[account.parent_account_id].credit += currentAccount.credit;
        }
      });

      // Calculate final values
      const monthlyAccountsResult: MonthlyAccount[] = accountsToQuery.map((account: any) => {
        const data = accountMap[account.id];
        const isDebit = account.balance_type === "deudor";
        
        // Initial balance
        let initial_balance = 0;
        if (isDebit) {
          initial_balance = data.prev_debit - data.prev_credit;
        } else {
          initial_balance = data.prev_credit - data.prev_debit;
        }
        
        const debit = data.debit;
        const credit = data.credit;
        const movement = debit - credit;
        
        // Final balance
        let final_balance = 0;
        if (isDebit) {
          final_balance = initial_balance + movement;
        } else {
          final_balance = initial_balance - movement;
        }

        return {
          ...account,
          initial_balance: Math.round(initial_balance * 100) / 100,
          debit: Math.round(debit * 100) / 100,
          credit: Math.round(credit * 100) / 100,
          movement: Math.round(movement * 100) / 100,
          final_balance: Math.round(final_balance * 100) / 100,
        };
      });

      setMonthlyAccounts(monthlyAccountsResult);
    } catch (error: unknown) {
      toast({
        title: "Error al consultar saldos",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setQuerying(false);
    }
  };

  const handleViewDetails = (accountId: number) => {
    const dateRange = calculateDateRange();
    if (!dateRange) return;
    
    const params = new URLSearchParams({
      accountId: accountId.toString(),
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    });
    navigate(`/mayor?${params.toString()}`);
  };

  const getSelectedMonthsLabel = () => {
    if (selectedMonths.length === 0) return "Seleccionar meses";
    if (selectedMonths.length === 1) {
      return MONTHS.find(m => m.value === selectedMonths[0])?.label || "";
    }
    const sorted = [...selectedMonths].sort((a, b) => a - b);
    const first = MONTHS.find(m => m.value === sorted[0])?.label || "";
    const last = MONTHS.find(m => m.value === sorted[sorted.length - 1])?.label || "";
    return `${first} - ${last}`;
  };

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver los saldos mensuales
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="sticky top-0 z-10 bg-background pb-4 -mx-8 px-8 pt-0 border-b mb-2">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Saldos Mensuales</h1>
            <p className="text-muted-foreground">Consulta de saldos por mes</p>
            
            {monthlyAccounts.length > 0 && (
              <div className="mt-4 flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Debe: </span>
                  <span className="font-semibold">Q {totals.totalDebit}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Haber: </span>
                  <span className="font-semibold">Q {totals.totalCredit}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end flex-wrap">
            {/* Period Selector */}
            <div>
              <Label htmlFor="period-select">Período Contable</Label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger id="period-select" className="w-[180px]">
                  <SelectValue placeholder="Seleccionar período" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={String(period.id)}>
                      {period.year} ({period.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Account Selector */}
            <div>
              <Label>Cuentas</Label>
              <Popover open={accountsPopoverOpen} onOpenChange={setAccountsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-[240px] justify-between"
                  >
                    {selectedAccounts.length === 0 
                      ? "Todas las cuentas" 
                      : `${selectedAccounts.length} cuenta(s)`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cuenta..." />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>No se encontraron cuentas.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={handleSelectAllAccounts}>
                          <Checkbox
                            checked={selectedAccounts.length === allAccounts.length}
                            className="mr-2"
                          />
                          <span className="font-semibold">Seleccionar todas</span>
                        </CommandItem>
                        {allAccounts.map((account) => (
                          <CommandItem
                            key={account.id}
                            value={`${account.account_code} ${account.account_name}`}
                            onSelect={() => handleAccountToggle(account.id)}
                          >
                            <Checkbox
                              checked={selectedAccounts.includes(account.id)}
                              className="mr-2"
                            />
                            <span className="font-mono text-xs mr-2">{account.account_code}</span>
                            <span className="truncate">{account.account_name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Months Selector */}
            <div>
              <Label>Meses (consecutivos)</Label>
              <Popover open={monthsPopoverOpen} onOpenChange={setMonthsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-[200px] justify-between"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {getSelectedMonthsLabel()}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {MONTHS.map((month) => {
                          const isSelected = selectedMonths.includes(month.value);
                          const min = selectedMonths.length > 0 ? Math.min(...selectedMonths) : 0;
                          const max = selectedMonths.length > 0 ? Math.max(...selectedMonths) : 0;
                          
                          // Disable if not adjacent and not already selected
                          const isDisabled = selectedMonths.length > 0 && 
                            !isSelected && 
                            month.value !== min - 1 && 
                            month.value !== max + 1;
                          
                          // Can only remove from extremes
                          const canRemove = isSelected && (month.value === min || month.value === max || selectedMonths.length === 1);
                          
                          return (
                            <CommandItem
                              key={month.value}
                              onSelect={() => handleMonthToggle(month.value)}
                              disabled={isDisabled || (isSelected && !canRemove)}
                              className={cn(
                                isDisabled && "opacity-50 cursor-not-allowed"
                              )}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  isSelected ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {month.label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <Button 
              onClick={handleQuery} 
              disabled={querying || loading || selectedMonths.length === 0}
            >
              {querying ? "Consultando..." : "Consultar"}
            </Button>
          </div>
          
          {selectedMonths.length > 0 && selectedPeriodData && (
            <p className="text-sm text-muted-foreground mt-3">
              Período: {calculateDateRange()?.startDate} al {calculateDateRange()?.endDate}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Saldos por Cuenta</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || querying ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              <p className="text-muted-foreground">
                {loading ? "Cargando datos..." : "Consultando saldos..."}
              </p>
            </div>
          ) : monthlyAccounts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Selecciona los filtros y presiona "Consultar" para ver los saldos
            </p>
          ) : (
            <div className="space-y-4">
              <MonthlyBalanceTreeView 
                accounts={monthlyAccounts} 
                onViewDetails={handleViewDetails} 
              />
              
              <div className="flex justify-end gap-8 pt-4 pr-3 border-t-2 bg-muted/30 rounded-lg p-4">
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total Debe</div>
                  <div className="text-lg font-semibold font-mono">Q {totals.totalDebit}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total Haber</div>
                  <div className="text-lg font-semibold font-mono">Q {totals.totalCredit}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

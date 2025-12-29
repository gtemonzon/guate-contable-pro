import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BalanceTreeView } from "@/components/balance/BalanceTreeView";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  balance_type: string;
  level: number;
  previous_balance: number;
  debit: number;
  credit: number;
  balance: number;
  parent_account_id: number | null;
}

interface AccountPeriod {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

export default function BalanceSaldos() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [periods, setPeriods] = useState<AccountPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [previousBalance, setPreviousBalance] = useState<number>(0);

  const { toast } = useToast();
  const navigate = useNavigate();

  const totals = useMemo(() => {
    // Solo sumar cuentas detalle (que no tienen hijos)
    const detailAccounts = accounts.filter(acc => {
      const hasChildren = accounts.some(child => child.parent_account_id === acc.id);
      return !hasChildren;
    });
    
    const totalDebit = detailAccounts.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredit = detailAccounts.reduce((sum, acc) => sum + acc.credit, 0);
    
    return {
      totalDebit: formatCurrency(totalDebit),
      totalCredit: formatCurrency(totalCredit),
    };
  }, [accounts]);

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchPeriods(enterpriseId);
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
        fetchPeriods(newEnterpriseId);
      } else {
        setAccounts([]);
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

  const fetchPeriods = async (enterpriseId: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("tab_accounting_periods")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .order("year", { ascending: false });

      if (error) throw error;
      
      setPeriods(data || []);
      
      // Auto-seleccionar el primer período abierto o el más reciente
      if (data && data.length > 0) {
        const openPeriod = data.find(p => p.status === "abierto");
        const defaultPeriod = openPeriod || data[0];
        setSelectedPeriod(String(defaultPeriod.id));
        setStartDate(defaultPeriod.start_date);
        setEndDate(defaultPeriod.end_date);
        await fetchBalances(enterpriseId, defaultPeriod.id, defaultPeriod.start_date, defaultPeriod.end_date);
      }
    } catch (error: any) {
      toast({
        title: "Error al cargar períodos",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async (enterpriseId: string, periodId: number, fromDate?: string, toDate?: string) => {
    try {
      setLoading(true);

      const dateFrom = fromDate || startDate;
      const dateTo = toDate || endDate;

      // Obtener todas las cuentas de la empresa
      const { data: accountsData, error: accountsError } = await supabase
        .from("tab_accounts")
        .select("*")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("is_active", true)
        .order("account_code");

      if (accountsError) throw accountsError;

      // Obtener el período seleccionado
      const { data: period, error: periodError } = await supabase
        .from("tab_accounting_periods")
        .select("*")
        .eq("id", periodId)
        .single();

      if (periodError) throw periodError;

      // Obtener todos los movimientos del período y rango de fechas (con paginación automática)
      const entries = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entries")
          .select(`
            id,
            entry_date,
            is_posted,
            tab_journal_entry_details (
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .eq("enterprise_id", parseInt(enterpriseId))
          .eq("accounting_period_id", periodId)
          .eq("is_posted", true)
          .gte("entry_date", dateFrom)
          .lte("entry_date", dateTo)
      );

      // Calcular saldos anteriores (antes del dateFrom) con paginación automática
      const prevEntries = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entries")
          .select(`
            id,
            entry_date,
            tab_journal_entry_details (
              account_id,
              debit_amount,
              credit_amount
            )
          `)
          .eq("enterprise_id", parseInt(enterpriseId))
          .eq("accounting_period_id", periodId)
          .eq("is_posted", true)
          .lt("entry_date", dateFrom)
      );

      // Calcular saldos anteriores por cuenta de detalle
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

      // Calcular saldos por cuenta de detalle (movimientos directos)
      const balances: Record<number, { debit: number; credit: number }> = {};

      entries?.forEach((entry: any) => {
        entry.tab_journal_entry_details?.forEach((detail: any) => {
          if (!balances[detail.account_id]) {
            balances[detail.account_id] = { debit: 0, credit: 0 };
          }
          balances[detail.account_id].debit += detail.debit_amount || 0;
          balances[detail.account_id].credit += detail.credit_amount || 0;
        });
      });

      // Crear mapa de cuentas por ID para acceso rápido
      const accountMap: Record<number, any> = {};
      accountsData.forEach((account: any) => {
        const prevBal = previousBalances[account.id] || { debit: 0, credit: 0 };
        accountMap[account.id] = {
          ...account,
          previous_debit: prevBal.debit,
          previous_credit: prevBal.credit,
          debit: balances[account.id]?.debit || 0,
          credit: balances[account.id]?.credit || 0,
        };
      });

      // Propagar saldos anteriores hacia arriba en la jerarquía
      const sortedAccountsForPrev = [...accountsData].sort((a, b) => b.level - a.level);
      sortedAccountsForPrev.forEach((account: any) => {
        const currentAccount = accountMap[account.id];
        if (account.parent_account_id && accountMap[account.parent_account_id]) {
          accountMap[account.parent_account_id].previous_debit += currentAccount.previous_debit;
          accountMap[account.parent_account_id].previous_credit += currentAccount.previous_credit;
        }
      });

      // Propagar saldos hacia arriba en la jerarquía
      // Ordenar por nivel descendente para procesar desde las hojas hacia arriba
      const sortedAccounts = [...accountsData].sort((a, b) => b.level - a.level);
      
      sortedAccounts.forEach((account: any) => {
        const currentAccount = accountMap[account.id];
        
        // Si tiene cuenta padre, sumar sus saldos al padre
        if (account.parent_account_id && accountMap[account.parent_account_id]) {
          accountMap[account.parent_account_id].debit += currentAccount.debit;
          accountMap[account.parent_account_id].credit += currentAccount.credit;
        }
      });

      // Combinar cuentas con sus saldos propagados
      const accountsWithBalances: Account[] = accountsData.map((account: any) => {
        const accountData = accountMap[account.id];
        const prevDebit = accountData.previous_debit;
        const prevCredit = accountData.previous_credit;
        const debit = accountData.debit;
        const credit = accountData.credit;
        
        // Calcular balance anterior según tipo de cuenta
        let previousBalance = 0;
        if (account.balance_type === "deudor") {
          previousBalance = prevDebit - prevCredit;
        } else {
          previousBalance = prevCredit - prevDebit;
        }
        
        // Calcular balance actual: saldo anterior + movimientos del período
        let balance = 0;
        if (account.balance_type === "deudor") {
          // Cuenta deudora: saldo anterior + debe - haber
          balance = previousBalance + debit - credit;
        } else {
          // Cuenta acreedora: saldo anterior + haber - debe
          balance = previousBalance + credit - debit;
        }

        return {
          id: account.id,
          account_code: account.account_code,
          account_name: account.account_name,
          balance_type: account.balance_type,
          level: account.level,
          previous_balance: previousBalance,
          debit,
          credit,
          balance,
          parent_account_id: account.parent_account_id,
        };
      });

      setAccounts(accountsWithBalances);
    } catch (error: any) {
      toast({
        title: "Error al cargar saldos",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (periodId: string) => {
    setSelectedPeriod(periodId);
    const period = periods.find(p => p.id === parseInt(periodId));
    if (currentEnterpriseId && period) {
      setStartDate(period.start_date);
      setEndDate(period.end_date);
      fetchBalances(currentEnterpriseId, parseInt(periodId), period.start_date, period.end_date);
    }
  };

  const handleDateFilterChange = () => {
    if (currentEnterpriseId && selectedPeriod && startDate && endDate) {
      fetchBalances(currentEnterpriseId, parseInt(selectedPeriod), startDate, endDate);
    }
  };

  const filteredAccounts = useMemo(() => {
    return accounts;
  }, [accounts]);

  const handleViewDetails = (accountId: number) => {
    // Navegar a Mayor General con la cuenta y fechas preseleccionadas
    const params = new URLSearchParams({
      accountId: accountId.toString(),
      startDate: startDate,
      endDate: endDate,
    });
    navigate(`/mayor?${params.toString()}`);
  };

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver el balance de saldos
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Balance de Saldos</h1>
          <p className="text-muted-foreground">Saldos de cuentas por período contable</p>
          
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
        </div>
        
        <div className="flex gap-4 items-end flex-wrap">
          <div>
            <Label htmlFor="period-select">Período Contable</Label>
            <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
              <SelectTrigger id="period-select" className="w-[200px]">
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

          <div>
            <Label htmlFor="start-date">Desde</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[150px]"
            />
          </div>
          
          <div>
            <Label htmlFor="end-date">Hasta</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[150px]"
            />
          </div>

          <Button onClick={handleDateFilterChange} variant="outline">
            Filtrar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas y Saldos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : filteredAccounts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No hay cuentas para mostrar</p>
          ) : (
            <div className="space-y-4">
              <BalanceTreeView accounts={filteredAccounts} onViewDetails={handleViewDetails} />
              
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

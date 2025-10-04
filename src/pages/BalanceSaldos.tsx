import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  balance_type: string;
  level: number;
  debit: number;
  credit: number;
  balance: number;
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
  const [filterLevel, setFilterLevel] = useState<string>("all");

  const { toast } = useToast();

  const totals = useMemo(() => {
    const totalDebit = accounts.reduce((sum, acc) => sum + acc.debit, 0);
    const totalCredit = accounts.reduce((sum, acc) => sum + acc.credit, 0);
    
    return {
      totalDebit: totalDebit.toFixed(2),
      totalCredit: totalCredit.toFixed(2),
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
        await fetchBalances(enterpriseId, defaultPeriod.id);
      }
    } catch (error: any) {
      toast({
        title: "Error al cargar períodos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async (enterpriseId: string, periodId: number) => {
    try {
      setLoading(true);

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

      // Obtener todos los movimientos del período
      const { data: entries, error: entriesError } = await supabase
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
        .gte("entry_date", period.start_date)
        .lte("entry_date", period.end_date);

      if (entriesError) throw entriesError;

      // Calcular saldos por cuenta
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

      // Combinar cuentas con sus saldos
      const accountsWithBalances: Account[] = accountsData.map((account: any) => {
        const accountBalance = balances[account.id] || { debit: 0, credit: 0 };
        const debit = accountBalance.debit;
        const credit = accountBalance.credit;
        
        // Calcular balance según tipo de cuenta
        let balance = 0;
        if (account.balance_type === "deudor") {
          balance = debit - credit;
        } else {
          balance = credit - debit;
        }

        return {
          id: account.id,
          account_code: account.account_code,
          account_name: account.account_name,
          balance_type: account.balance_type,
          level: account.level,
          debit,
          credit,
          balance,
        };
      });

      setAccounts(accountsWithBalances);
    } catch (error: any) {
      toast({
        title: "Error al cargar saldos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (periodId: string) => {
    setSelectedPeriod(periodId);
    if (currentEnterpriseId) {
      fetchBalances(currentEnterpriseId, parseInt(periodId));
    }
  };

  const filteredAccounts = useMemo(() => {
    if (filterLevel === "all") return accounts;
    return accounts.filter(acc => acc.level === parseInt(filterLevel));
  }, [accounts, filterLevel]);

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
        
        <div className="flex gap-4 items-end">
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
            <Label htmlFor="level-filter">Nivel</Label>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger id="level-filter" className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="1">Nivel 1</SelectItem>
                <SelectItem value="2">Nivel 2</SelectItem>
                <SelectItem value="3">Nivel 3</SelectItem>
                <SelectItem value="4">Nivel 4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas y Saldos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Código</TableHead>
                    <TableHead className="min-w-[250px]">Nombre de Cuenta</TableHead>
                    <TableHead className="w-[100px]">Nivel</TableHead>
                    <TableHead className="w-[120px]">Tipo</TableHead>
                    <TableHead className="w-[150px] text-right">Debe</TableHead>
                    <TableHead className="w-[150px] text-right">Haber</TableHead>
                    <TableHead className="w-[150px] text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No hay cuentas para mostrar
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAccounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-mono">{account.account_code}</TableCell>
                        <TableCell 
                          className="font-medium"
                          style={{ paddingLeft: `${account.level * 20}px` }}
                        >
                          {account.account_name}
                        </TableCell>
                        <TableCell>{account.level}</TableCell>
                        <TableCell>
                          <span className={account.balance_type === "deudor" ? "text-blue-600" : "text-green-600"}>
                            {account.balance_type === "deudor" ? "Deudor" : "Acreedor"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {account.debit > 0 ? `Q ${account.debit.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {account.credit > 0 ? `Q ${account.credit.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {account.balance !== 0 ? `Q ${Math.abs(account.balance).toFixed(2)}` : "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                  {filteredAccounts.length > 0 && (
                    <TableRow className="bg-muted font-semibold">
                      <TableCell colSpan={4}>TOTALES</TableCell>
                      <TableCell className="text-right font-mono">Q {totals.totalDebit}</TableCell>
                      <TableCell className="text-right font-mono">Q {totals.totalCredit}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

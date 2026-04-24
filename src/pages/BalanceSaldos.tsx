import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { BalanceTreeView } from "@/components/balance/BalanceTreeView";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";

const SaldosMensuales = lazy(() => import("./SaldosMensuales"));

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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "mensual" ? "mensual" : "anual";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "mensual" ? { tab: "mensual" } : {}, { replace: true });
  };

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
    } catch (error: unknown) {
      toast({
        title: "Error al cargar períodos",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBalances = async (enterpriseId: string, _periodId: number, fromDate?: string, toDate?: string) => {
    try {
      setLoading(true);

      const dateFrom = fromDate || startDate;
      const dateTo   = toDate   || endDate;

      // Use server-side RPC — Postgres computes opening + period aggregates
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_trial_balance', {
        p_enterprise_id: parseInt(enterpriseId),
        p_start_date: dateFrom,
        p_end_date:   dateTo,
      });

      if (rpcError) throw rpcError;

      const accountsWithBalances: Account[] = (rpcData || []).map((row: any) => ({
        id:               Number(row.account_id),
        account_code:     row.account_code,
        account_name:     row.account_name,
        balance_type:     row.balance_type,
        level:            row.level,
        previous_balance: Number(row.opening_balance),
        debit:            Number(row.period_debit),
        credit:           Number(row.period_credit),
        balance:          Number(row.closing_balance),
        parent_account_id: row.parent_account_id ? Number(row.parent_account_id) : null,
      }));

      setAccounts(accountsWithBalances);
    } catch (error: unknown) {
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
      <div>
        <h1 className="text-3xl font-bold">Saldos de Cuentas</h1>
        <p className="text-muted-foreground">Consulta saldos contables anuales o desglose mensual</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList>
          <TabsTrigger value="anual">Anual / Por Período</TabsTrigger>
          <TabsTrigger value="mensual">Mensual</TabsTrigger>
        </TabsList>

        <TabsContent value="anual" className="mt-6 space-y-6">
          <div className="sticky top-0 z-10 bg-background pb-4 -mx-8 px-8 pt-0 border-b mb-2">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex gap-6 text-sm">
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
        </TabsContent>

        <TabsContent value="mensual" className="mt-6">
          <Suspense fallback={<p className="text-center text-muted-foreground py-8">Cargando vista mensual...</p>}>
            <SaldosMensuales />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

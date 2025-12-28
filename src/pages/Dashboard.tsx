import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Building2, FileText, Calendar, ShoppingCart, Receipt, Scale, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface BookSummary {
  month: number;
  year: number;
  base: number;
  vat: number;
  total: number;
  count: number;
  previousTotal?: number;
  percentageChange?: number;
}

interface KPIData {
  totalActivos: { value: number; change: number | null; trend: 'up' | 'down' | 'neutral' };
  totalPasivos: { value: number; change: number | null; trend: 'up' | 'down' | 'neutral' };
  utilidadMes: { value: number; change: number | null; trend: 'up' | 'down' | 'neutral' };
  liquidez: { value: number; change: number | null; trend: 'up' | 'down' | 'neutral' };
}

interface AccountBalance {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  balance_type: string | null;
  balance: number;
}

interface MonthlyChartData {
  month: string;
  monthNum: number;
  total: number;
}

const Dashboard = () => {
  const [purchaseSummary, setPurchaseSummary] = useState<BookSummary | null>(null);
  const [salesSummary, setSalesSummary] = useState<BookSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [yearlyChartsLoading, setYearlyChartsLoading] = useState(true);
  const [yearlySalesData, setYearlySalesData] = useState<MonthlyChartData[]>([]);
  const [yearlyPurchasesData, setYearlyPurchasesData] = useState<MonthlyChartData[]>([]);

  const formatNumber = (num: number): string => {
    return num.toLocaleString('es-GT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Función para calcular saldos de cuentas
  const calculateAccountBalances = async (
    enterpriseId: number,
    endDate: string
  ): Promise<AccountBalance[]> => {
    // Obtener cuentas activas
    const { data: accounts, error: accountsError } = await supabase
      .from("tab_accounts")
      .select("id, account_code, account_name, account_type, balance_type")
      .eq("enterprise_id", enterpriseId)
      .eq("is_active", true);

    if (accountsError || !accounts) return [];

    // Obtener todos los movimientos hasta la fecha indicada
    const baseQuery = supabase
      .from("tab_journal_entry_details")
      .select(`
        account_id,
        debit_amount,
        credit_amount,
        tab_journal_entries!inner(entry_date, enterprise_id)
      `)
      .eq("tab_journal_entries.enterprise_id", enterpriseId)
      .lte("tab_journal_entries.entry_date", endDate);

    const movements = await fetchAllRecords<any>(baseQuery);

    // Agrupar movimientos por cuenta
    const balanceMap = new Map<number, { debits: number; credits: number }>();
    
    movements.forEach((mov) => {
      const accountId = mov.account_id;
      if (!balanceMap.has(accountId)) {
        balanceMap.set(accountId, { debits: 0, credits: 0 });
      }
      const current = balanceMap.get(accountId)!;
      current.debits += Number(mov.debit_amount || 0);
      current.credits += Number(mov.credit_amount || 0);
    });

    // Calcular saldo según tipo de cuenta
    return accounts.map((acc) => {
      const movements = balanceMap.get(acc.id) || { debits: 0, credits: 0 };
      let balance = 0;
      
      // Saldo deudor: débitos - créditos (activos, gastos)
      // Saldo acreedor: créditos - débitos (pasivos, patrimonio, ingresos)
      if (acc.balance_type === 'deudor' || acc.account_type === 'activo' || acc.account_type === 'gasto') {
        balance = movements.debits - movements.credits;
      } else {
        balance = movements.credits - movements.debits;
      }

      return {
        id: acc.id,
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        balance_type: acc.balance_type,
        balance
      };
    });
  };

  // Función para calcular utilidad de un período específico
  const calculatePeriodProfit = async (
    enterpriseId: number,
    startDate: string,
    endDate: string
  ): Promise<number> => {
    const { data: accounts } = await supabase
      .from("tab_accounts")
      .select("id, account_type")
      .eq("enterprise_id", enterpriseId)
      .eq("is_active", true)
      .in("account_type", ["ingreso", "gasto"]);

    if (!accounts || accounts.length === 0) return 0;

    const accountIds = accounts.map(a => a.id);

    const baseQuery = supabase
      .from("tab_journal_entry_details")
      .select(`
        account_id,
        debit_amount,
        credit_amount,
        tab_journal_entries!inner(entry_date, enterprise_id)
      `)
      .eq("tab_journal_entries.enterprise_id", enterpriseId)
      .gte("tab_journal_entries.entry_date", startDate)
      .lte("tab_journal_entries.entry_date", endDate)
      .in("account_id", accountIds);

    const movements = await fetchAllRecords<any>(baseQuery);

    const accountTypeMap = new Map(accounts.map(a => [a.id, a.account_type]));
    
    let ingresos = 0;
    let gastos = 0;

    movements.forEach((mov) => {
      const accountType = accountTypeMap.get(mov.account_id);
      const debit = Number(mov.debit_amount || 0);
      const credit = Number(mov.credit_amount || 0);

      if (accountType === 'ingreso') {
        ingresos += credit - debit; // Ingresos son acreedores
      } else if (accountType === 'gasto') {
        gastos += debit - credit; // Gastos son deudores
      }
    });

    return ingresos - gastos;
  };

  // Cargar KPIs
  useEffect(() => {
    const fetchKPIs = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) {
        setKpiLoading(false);
        return;
      }

      try {
        const enterpriseId = parseInt(currentEnterpriseId);
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        
        // Fechas del mes actual
        const currentMonthStart = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
        const currentMonthEnd = today.toISOString().split('T')[0];
        
        // Fechas del mes anterior
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        const prevMonthStart = new Date(prevYear, prevMonth, 1).toISOString().split('T')[0];
        const prevMonthEnd = new Date(prevYear, prevMonth + 1, 0).toISOString().split('T')[0];

        // Calcular saldos actuales
        const currentBalances = await calculateAccountBalances(enterpriseId, currentMonthEnd);
        const prevBalances = await calculateAccountBalances(enterpriseId, prevMonthEnd);

        // Total Activos
        const totalActivos = currentBalances
          .filter(acc => acc.account_type === 'activo')
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
        
        const prevTotalActivos = prevBalances
          .filter(acc => acc.account_type === 'activo')
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);

        // Total Pasivos
        const totalPasivos = currentBalances
          .filter(acc => acc.account_type === 'pasivo')
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
        
        const prevTotalPasivos = prevBalances
          .filter(acc => acc.account_type === 'pasivo')
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);

        // Utilidad del mes actual
        const utilidadMes = await calculatePeriodProfit(enterpriseId, currentMonthStart, currentMonthEnd);
        const prevUtilidadMes = await calculatePeriodProfit(enterpriseId, prevMonthStart, prevMonthEnd);

        // Liquidez (Activo Corriente / Pasivo Corriente)
        const activoCorriente = currentBalances
          .filter(acc => acc.account_code.startsWith('1.1') || acc.account_code.startsWith('1-1') || acc.account_code.startsWith('11'))
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
        
        const pasivoCorriente = currentBalances
          .filter(acc => acc.account_code.startsWith('2.1') || acc.account_code.startsWith('2-1') || acc.account_code.startsWith('21'))
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
        
        const liquidez = pasivoCorriente > 0 ? activoCorriente / pasivoCorriente : 0;

        const prevActivoCorriente = prevBalances
          .filter(acc => acc.account_code.startsWith('1.1') || acc.account_code.startsWith('1-1') || acc.account_code.startsWith('11'))
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
        
        const prevPasivoCorriente = prevBalances
          .filter(acc => acc.account_code.startsWith('2.1') || acc.account_code.startsWith('2-1') || acc.account_code.startsWith('21'))
          .reduce((sum, acc) => sum + Math.abs(acc.balance), 0);
        
        const prevLiquidez = prevPasivoCorriente > 0 ? prevActivoCorriente / prevPasivoCorriente : 0;

        // Calcular cambios porcentuales
        const calculateChange = (current: number, previous: number): number | null => {
          if (previous === 0) return current !== 0 ? 100 : null;
          return ((current - previous) / Math.abs(previous)) * 100;
        };

        const getTrend = (change: number | null, invertedLogic = false): 'up' | 'down' | 'neutral' => {
          if (change === null) return 'neutral';
          if (invertedLogic) {
            return change > 0 ? 'down' : change < 0 ? 'up' : 'neutral';
          }
          return change > 0 ? 'up' : change < 0 ? 'down' : 'neutral';
        };

        setKpiData({
          totalActivos: {
            value: totalActivos,
            change: calculateChange(totalActivos, prevTotalActivos),
            trend: getTrend(calculateChange(totalActivos, prevTotalActivos))
          },
          totalPasivos: {
            value: totalPasivos,
            change: calculateChange(totalPasivos, prevTotalPasivos),
            trend: getTrend(calculateChange(totalPasivos, prevTotalPasivos), true) // Menos pasivos es mejor
          },
          utilidadMes: {
            value: utilidadMes,
            change: calculateChange(utilidadMes, prevUtilidadMes),
            trend: getTrend(calculateChange(utilidadMes, prevUtilidadMes))
          },
          liquidez: {
            value: liquidez,
            change: liquidez - prevLiquidez,
            trend: getTrend(liquidez - prevLiquidez)
          }
        });
      } catch (error) {
        console.error("Error fetching KPIs:", error);
      } finally {
        setKpiLoading(false);
      }
    };

    fetchKPIs();
  }, []);

  // Cargar últimas partidas
  useEffect(() => {
    const fetchRecentEntries = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) return;

      const { data: entries } = await supabase
        .from("tab_journal_entries")
        .select("id, entry_number, entry_date, description, total_debit")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .order("entry_date", { ascending: false })
        .limit(3);

      if (entries) {
        setRecentEntries(entries.map(e => ({
          id: e.id,
          number: e.entry_number,
          date: e.entry_date,
          description: e.description,
          amount: `Q ${formatNumber(Number(e.total_debit || 0))}`
        })));
      }
    };

    fetchRecentEntries();
  }, []);

  useEffect(() => {
    const fetchBookSummaries = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) {
        setLoading(false);
        return;
      }

      try {
        // Fetch all purchase books to find months with data
        const { data: purchaseBooks } = await supabase
          .from("tab_purchase_books")
          .select("id, month, year")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(12);

        if (purchaseBooks && purchaseBooks.length > 0) {
          let lastBookWithData = null;
          let prevBookWithData = null;
          let purchases = null;
          
          for (const book of purchaseBooks) {
            const { data: bookPurchases } = await supabase
              .from("tab_purchase_ledger")
              .select("net_amount, vat_amount, total_amount")
              .eq("purchase_book_id", book.id);

            if (bookPurchases && bookPurchases.length > 0) {
              if (!lastBookWithData) {
                lastBookWithData = book;
                purchases = bookPurchases;
              } else if (!prevBookWithData) {
                prevBookWithData = book;
                break;
              }
            }
          }

          if (lastBookWithData && purchases && purchases.length > 0) {
            const summary: BookSummary = purchases.reduce(
              (acc, curr) => ({
                month: lastBookWithData.month,
                year: lastBookWithData.year,
                base: acc.base + Number(curr.net_amount || 0),
                vat: acc.vat + Number(curr.vat_amount || 0),
                total: acc.total + Number(curr.total_amount || 0),
                count: acc.count + 1,
              }),
              { month: 0, year: 0, base: 0, vat: 0, total: 0, count: 0 } as BookSummary
            );

            if (prevBookWithData) {
              const { data: prevPurchases } = await supabase
                .from("tab_purchase_ledger")
                .select("total_amount")
                .eq("purchase_book_id", prevBookWithData.id);

              if (prevPurchases && prevPurchases.length > 0) {
                const prevTotal = prevPurchases.reduce(
                  (sum, curr) => sum + Number(curr.total_amount || 0),
                  0
                );
                summary.previousTotal = prevTotal;
                if (prevTotal > 0) {
                  summary.percentageChange =
                    ((summary.total - prevTotal) / prevTotal) * 100;
                }
              }
            }

            setPurchaseSummary(summary);
          }
        }

        // Fetch sales data
        const { data: sales } = await supabase
          .from("tab_sales_ledger")
          .select("invoice_date, net_amount, vat_amount, total_amount")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .order("invoice_date", { ascending: false })
          .limit(500);

        if (sales && sales.length > 0) {
          const grouped: { [key: string]: BookSummary } = sales.reduce((acc: any, curr) => {
            const date = new Date(curr.invoice_date);
            const month = date.getMonth() + 1;
            const year = date.getFullYear();
            // Use padded month for proper sorting (e.g., "2025-01" instead of "2025-1")
            const key = `${year}-${String(month).padStart(2, '0')}`;
            if (!acc[key]) {
              acc[key] = {
                month: month,
                year: year,
                base: 0,
                vat: 0,
                total: 0,
                count: 0,
              };
            }
            acc[key].base += Number(curr.net_amount || 0);
            acc[key].vat += Number(curr.vat_amount || 0);
            acc[key].total += Number(curr.total_amount || 0);
            acc[key].count += 1;
            return acc;
          }, {});

          const sortedKeys = Object.keys(grouped).sort().reverse();
          if (sortedKeys.length > 0) {
            const lastMonth = grouped[sortedKeys[0]];
            
            if (sortedKeys.length > 1) {
              const prevMonth = grouped[sortedKeys[1]];
              lastMonth.previousTotal = prevMonth.total;
              if (prevMonth.total > 0) {
                lastMonth.percentageChange =
                  ((lastMonth.total - prevMonth.total) / prevMonth.total) * 100;
              }
            }
            
            setSalesSummary(lastMonth);
          }
        }
      } catch (error) {
        console.error("Error fetching book summaries:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBookSummaries();
  }, []);

  // Cargar datos anuales para gráficas
  useEffect(() => {
    const fetchYearlyData = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) {
        setYearlyChartsLoading(false);
        return;
      }

      try {
        const currentYear = new Date().getFullYear();
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        // Inicializar datos mensuales con ceros
        const initializeMonthlyData = (): MonthlyChartData[] => 
          monthNames.map((month, index) => ({ month, monthNum: index + 1, total: 0 }));

        // Fetch ventas del año
        const { data: sales } = await supabase
          .from("tab_sales_ledger")
          .select("invoice_date, total_amount")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .gte("invoice_date", `${currentYear}-01-01`)
          .lte("invoice_date", `${currentYear}-12-31`);

        const salesByMonth = initializeMonthlyData();
        if (sales) {
          sales.forEach((sale) => {
            const month = new Date(sale.invoice_date).getMonth();
            salesByMonth[month].total += Number(sale.total_amount || 0);
          });
        }
        setYearlySalesData(salesByMonth);

        // Fetch compras del año
        const { data: purchaseBooks } = await supabase
          .from("tab_purchase_books")
          .select("id, month, year")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("year", currentYear);

        const purchasesByMonth = initializeMonthlyData();
        if (purchaseBooks && purchaseBooks.length > 0) {
          for (const book of purchaseBooks) {
            const { data: purchases } = await supabase
              .from("tab_purchase_ledger")
              .select("total_amount")
              .eq("purchase_book_id", book.id);

            if (purchases) {
              const totalForMonth = purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
              purchasesByMonth[book.month - 1].total += totalForMonth;
            }
          }
        }
        setYearlyPurchasesData(purchasesByMonth);
      } catch (error) {
        console.error("Error fetching yearly data:", error);
      } finally {
        setYearlyChartsLoading(false);
      }
    };

    fetchYearlyData();
  }, []);

  // KPIs dinámicos
  const formatChange = (change: number | null | undefined, isPercentage = true): string => {
    if (change === null || change === undefined) return "N/A";
    const sign = change >= 0 ? '+' : '';
    return isPercentage ? `${sign}${change.toFixed(1)}%` : `${sign}${change.toFixed(2)}`;
  };

  const kpis = [
    {
      title: "Total Activos",
      value: kpiData ? `Q ${formatNumber(kpiData.totalActivos.value)}` : "Q 0.00",
      change: kpiData ? formatChange(kpiData.totalActivos.change) : "N/A",
      trend: kpiData?.totalActivos?.trend || 'neutral',
      icon: DollarSign,
    },
    {
      title: "Total Pasivos",
      value: kpiData ? `Q ${formatNumber(kpiData.totalPasivos.value)}` : "Q 0.00",
      change: kpiData ? formatChange(kpiData.totalPasivos.change) : "N/A",
      trend: kpiData?.totalPasivos?.trend || 'neutral',
      icon: Scale,
    },
    {
      title: "Utilidad del Mes",
      value: kpiData ? `Q ${formatNumber(kpiData.utilidadMes.value)}` : "Q 0.00",
      change: kpiData ? formatChange(kpiData.utilidadMes.change) : "N/A",
      trend: kpiData?.utilidadMes?.trend || 'neutral',
      icon: TrendingUp,
    },
    {
      title: "Liquidez",
      value: kpiData ? kpiData.liquidez.value.toFixed(2) : "0.00",
      change: kpiData ? formatChange(kpiData.liquidez.change, false) : "N/A",
      trend: kpiData?.liquidez?.trend || 'neutral',
      icon: Wallet,
    },
  ];

  const displayedEntries = recentEntries.length > 0 ? recentEntries : [
    { id: 1, number: "-", date: "-", description: "No hay partidas registradas", amount: "Q 0.00" }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen general de tu información contable
        </p>
      </div>

      {/* KPIs Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {kpiLoading ? (
                <>
                  <Skeleton className="h-8 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold financial-number">{kpi.value}</div>
                  <p className={`text-xs ${
                    kpi.trend === "up" ? "text-success" : 
                    kpi.trend === "down" ? "text-destructive" : 
                    "text-muted-foreground"
                  }`}>
                    {kpi.change} vs mes anterior
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity and Alerts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimas Partidas Contabilizadas</CardTitle>
            <CardDescription>
              Movimientos más recientes en el sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {displayedEntries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent">
                      <FileText className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{entry.number}</p>
                      <p className="text-xs text-muted-foreground">{entry.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium financial-number">{entry.amount}</p>
                    <p className="text-xs text-muted-foreground">{entry.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alertas y Notificaciones</CardTitle>
            <CardDescription>
              Información importante que requiere tu atención
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/5 p-3">
                <Calendar className="h-5 w-5 text-warning mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Período pendiente de cierre</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    El período contable 2024 está pendiente de cierre
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/5 p-3">
                <Building2 className="h-5 w-5 text-success mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Sistema configurado</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tu empresa está lista para comenzar a operar
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Latest Books Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Último Mes de Ventas</CardTitle>
                <CardDescription>
                  {salesSummary
                    ? `${getMonthName(salesSummary.month)} ${salesSummary.year}`
                    : "No hay registros"}
                </CardDescription>
              </div>
              <Receipt className="h-8 w-8 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : salesSummary ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Base:</span>
                  <span className="text-lg font-semibold financial-number">
                    Q {formatNumber(salesSummary.base)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">IVA:</span>
                  <span className="text-lg font-semibold financial-number">
                    Q {formatNumber(salesSummary.vat)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-xl font-bold text-success financial-number">
                    Q {formatNumber(salesSummary.total)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Cantidad de documentos:</span>
                  <span className="text-lg font-semibold">{salesSummary.count}</span>
                </div>
                {salesSummary.percentageChange !== undefined && (
                  <div className="flex justify-between items-center pt-2 mt-2 border-t">
                    <span className="text-xs text-muted-foreground">vs mes anterior</span>
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: salesSummary.percentageChange >= 0 
                          ? "hsl(var(--success))" 
                          : "hsl(var(--destructive))"
                      }}
                    >
                      {salesSummary.percentageChange >= 0 ? "+" : ""}
                      {salesSummary.percentageChange.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No hay ventas registradas</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Último Mes de Compras</CardTitle>
                <CardDescription>
                  {purchaseSummary
                    ? `${getMonthName(purchaseSummary.month)} ${purchaseSummary.year}`
                    : "No hay registros"}
                </CardDescription>
              </div>
              <ShoppingCart className="h-8 w-8 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : purchaseSummary ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Base:</span>
                  <span className="text-lg font-semibold financial-number">
                    Q {formatNumber(purchaseSummary.base)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">IVA:</span>
                  <span className="text-lg font-semibold financial-number">
                    Q {formatNumber(purchaseSummary.vat)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-xl font-bold text-destructive financial-number">
                    Q {formatNumber(purchaseSummary.total)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Cantidad de documentos:</span>
                  <span className="text-lg font-semibold">{purchaseSummary.count}</span>
                </div>
                {purchaseSummary.percentageChange !== undefined && (
                  <div className="flex justify-between items-center pt-2 mt-2 border-t">
                    <span className="text-xs text-muted-foreground">vs mes anterior</span>
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: purchaseSummary.percentageChange <= 0 
                          ? "hsl(var(--success))" 
                          : "hsl(var(--destructive))"
                      }}
                    >
                      {purchaseSummary.percentageChange >= 0 ? "+" : ""}
                      {purchaseSummary.percentageChange.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No hay compras registradas</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Yearly Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ventas del Año</CardTitle>
                <CardDescription>
                  Total mensual de ventas {new Date().getFullYear()}
                </CardDescription>
              </div>
              <Receipt className="h-6 w-6 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            {yearlyChartsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : yearlySalesData.some(d => d.total > 0) ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={yearlySalesData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 11 }} 
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      formatter={(value: number) => [`Q ${formatNumber(value)}`, 'Total']}
                      labelFormatter={(label) => `Mes: ${label}`}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="hsl(var(--success))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--success))', strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No hay ventas registradas este año</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Compras del Año</CardTitle>
                <CardDescription>
                  Total mensual de compras {new Date().getFullYear()}
                </CardDescription>
              </div>
              <ShoppingCart className="h-6 w-6 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            {yearlyChartsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : yearlyPurchasesData.some(d => d.total > 0) ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={yearlyPurchasesData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 11 }} 
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      className="text-muted-foreground"
                    />
                    <Tooltip 
                      formatter={(value: number) => [`Q ${formatNumber(value)}`, 'Total']}
                      labelFormatter={(label) => `Mes: ${label}`}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      stroke="hsl(var(--destructive))" 
                      strokeWidth={2}
                      dot={{ fill: 'hsl(var(--destructive))', strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No hay compras registradas este año</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const getMonthName = (month: number): string => {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  return months[month - 1] || "";
};

export default Dashboard;

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Building2, FileText, Calendar, ShoppingCart, Receipt, Scale, Wallet, ChevronDown, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DashboardAlerts } from "@/components/dashboard/DashboardAlerts";
import { DashboardPendingEntries } from "@/components/dashboard/DashboardPendingEntries";
import { DashboardIVASummary } from "@/components/dashboard/DashboardIVASummary";
import { DashboardBankBalances } from "@/components/dashboard/DashboardBankBalances";
import { DashboardTaxDeadlines } from "@/components/dashboard/DashboardTaxDeadlines";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
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
  [key: string]: number | string; // Dynamic keys for each year
}

const YEAR_COLORS = [
  "hsl(var(--success))",      // Verde
  "hsl(var(--primary))",      // Azul
  "hsl(220, 70%, 50%)",       // Azul oscuro
  "hsl(280, 70%, 50%)",       // Púrpura
  "hsl(30, 80%, 55%)",        // Naranja
];

interface ActivePeriod {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: string;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const [purchaseSummary, setPurchaseSummary] = useState<BookSummary | null>(null);
  const [salesSummary, setSalesSummary] = useState<BookSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [yearlyChartsLoading, setYearlyChartsLoading] = useState(true);
  const [yearlySalesData, setYearlySalesData] = useState<MonthlyChartData[]>([]);
  const [yearlyPurchasesData, setYearlyPurchasesData] = useState<MonthlyChartData[]>([]);
  const [activeYear, setActiveYear] = useState<number>(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedChartYears, setSelectedChartYears] = useState<number[]>([new Date().getFullYear()]);
  const [activePeriod, setActivePeriod] = useState<ActivePeriod | null>(null);

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

  // Obtener período contable activo
  useEffect(() => {
    const fetchActivePeriod = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) {
        setActivePeriod(null);
        return;
      }

      try {
        const enterpriseId = parseInt(currentEnterpriseId);
        const activePeriodId = localStorage.getItem(`currentPeriodId_${enterpriseId}`);

        let query = supabase
          .from("tab_accounting_periods")
          .select("id, year, start_date, end_date, status")
          .eq("enterprise_id", enterpriseId)
          .eq("status", "abierto");

        if (activePeriodId) {
          // Buscar el período específico guardado
          const { data: specificPeriod } = await supabase
            .from("tab_accounting_periods")
            .select("id, year, start_date, end_date, status")
            .eq("id", parseInt(activePeriodId))
            .single();

          if (specificPeriod) {
            setActivePeriod(specificPeriod);
            return;
          }
        }

        // Fallback: buscar el período abierto más reciente (is_default_period o el más reciente)
        const { data: periods } = await query
          .order("is_default_period", { ascending: false })
          .order("start_date", { ascending: false })
          .limit(1);

        if (periods && periods.length > 0) {
          setActivePeriod(periods[0]);
        } else {
          setActivePeriod(null);
        }
      } catch (error) {
        console.error("Error fetching active period:", error);
        setActivePeriod(null);
      }
    };

    fetchActivePeriod();

    // Escuchar cambios en el período o empresa
    const handleChange = () => fetchActivePeriod();
    window.addEventListener("periodChanged", handleChange);
    window.addEventListener("enterpriseChanged", handleChange);
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener("periodChanged", handleChange);
      window.removeEventListener("enterpriseChanged", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  // Cargar KPIs basados en el período activo
  useEffect(() => {
    const fetchKPIs = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) {
        setKpiLoading(false);
        return;
      }

      // Esperar a que se cargue el período activo
      if (activePeriod === null && localStorage.getItem(`currentPeriodId_${currentEnterpriseId}`)) {
        return; // Aún cargando el período
      }

      try {
        const enterpriseId = parseInt(currentEnterpriseId);
        
        let periodEndDate: string;
        let periodStartDate: string;
        let prevPeriodEndDate: string;
        let prevPeriodStartDate: string;

        if (activePeriod) {
          // Usar las fechas del período contable activo
          periodEndDate = activePeriod.end_date;
          periodStartDate = activePeriod.start_date;
          
          // Calcular período anterior (mismo rango pero un año antes para comparación anual)
          // O buscar el período anterior si existe
          const startDateObj = new Date(activePeriod.start_date);
          const endDateObj = new Date(activePeriod.end_date);
          
          // Obtener período anterior de la misma empresa
          const { data: prevPeriods } = await supabase
            .from("tab_accounting_periods")
            .select("start_date, end_date")
            .eq("enterprise_id", enterpriseId)
            .lt("end_date", activePeriod.start_date)
            .order("end_date", { ascending: false })
            .limit(1);

          if (prevPeriods && prevPeriods.length > 0) {
            prevPeriodStartDate = prevPeriods[0].start_date;
            prevPeriodEndDate = prevPeriods[0].end_date;
          } else {
            // No hay período anterior, usar un año antes
            const prevStart = new Date(startDateObj);
            prevStart.setFullYear(prevStart.getFullYear() - 1);
            const prevEnd = new Date(endDateObj);
            prevEnd.setFullYear(prevEnd.getFullYear() - 1);
            prevPeriodStartDate = prevStart.toISOString().split('T')[0];
            prevPeriodEndDate = prevEnd.toISOString().split('T')[0];
          }
        } else {
          // Fallback: usar fecha actual del sistema (no hay período activo)
          const today = new Date();
          const currentMonth = today.getMonth();
          const currentYear = today.getFullYear();
          
          periodStartDate = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
          periodEndDate = today.toISOString().split('T')[0];
          
          const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
          const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
          prevPeriodStartDate = new Date(prevYear, prevMonth, 1).toISOString().split('T')[0];
          prevPeriodEndDate = new Date(prevYear, prevMonth + 1, 0).toISOString().split('T')[0];
        }

        // Calcular saldos actuales
        const currentBalances = await calculateAccountBalances(enterpriseId, periodEndDate);
        const prevBalances = await calculateAccountBalances(enterpriseId, prevPeriodEndDate);

        // Total Activos - Sumar saldos respetando el signo (la depreciación acumulada es acreedora y debe restarse)
        const totalActivos = currentBalances
          .filter(acc => acc.account_type === 'activo')
          .reduce((sum, acc) => {
            // Las cuentas de activo con balance_type acreedor (como depreciación) tienen saldo negativo que debe restarse
            // acc.balance ya está calculado correctamente según balance_type
            return sum + acc.balance;
          }, 0);
        
        const prevTotalActivos = prevBalances
          .filter(acc => acc.account_type === 'activo')
          .reduce((sum, acc) => sum + acc.balance, 0);

        // Total Pasivos - Sumar los saldos sin Math.abs ya que están calculados correctamente
        const totalPasivos = currentBalances
          .filter(acc => acc.account_type === 'pasivo')
          .reduce((sum, acc) => sum + acc.balance, 0);
        
        const prevTotalPasivos = prevBalances
          .filter(acc => acc.account_type === 'pasivo')
          .reduce((sum, acc) => sum + acc.balance, 0);

        // Utilidad del período activo
        const utilidadMes = await calculatePeriodProfit(enterpriseId, periodStartDate, periodEndDate);
        const prevUtilidadMes = await calculatePeriodProfit(enterpriseId, prevPeriodStartDate, prevPeriodEndDate);

        // Liquidez (Activo Corriente / Pasivo Corriente)
        // Para activo corriente, sumar respetando el signo (aunque normalmente son deudores)
        const activoCorriente = currentBalances
          .filter(acc => acc.account_code.startsWith('1.1') || acc.account_code.startsWith('1-1') || acc.account_code.startsWith('11'))
          .reduce((sum, acc) => sum + acc.balance, 0);
        
        const pasivoCorriente = currentBalances
          .filter(acc => acc.account_code.startsWith('2.1') || acc.account_code.startsWith('2-1') || acc.account_code.startsWith('21'))
          .reduce((sum, acc) => sum + acc.balance, 0);
        
        // Si no hay pasivo corriente pero hay activo, la liquidez es muy alta (usamos -1 como indicador especial)
        // Si ambos son 0, liquidez es 0
        const liquidez = pasivoCorriente > 0 
          ? activoCorriente / pasivoCorriente 
          : (activoCorriente > 0 ? -1 : 0); // -1 indica "sin pasivo corriente pero con activo"

        const prevActivoCorriente = prevBalances
          .filter(acc => acc.account_code.startsWith('1.1') || acc.account_code.startsWith('1-1') || acc.account_code.startsWith('11'))
          .reduce((sum, acc) => sum + acc.balance, 0);
        
        const prevPasivoCorriente = prevBalances
          .filter(acc => acc.account_code.startsWith('2.1') || acc.account_code.startsWith('2-1') || acc.account_code.startsWith('21'))
          .reduce((sum, acc) => sum + acc.balance, 0);
        
        const prevLiquidez = prevPasivoCorriente > 0 
          ? prevActivoCorriente / prevPasivoCorriente 
          : (prevActivoCorriente > 0 ? -1 : 0);

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
  }, [activePeriod]);

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

        // Fetch sales data (excluding annulled invoices)
        const { data: sales } = await supabase
          .from("tab_sales_ledger")
          .select("invoice_date, net_amount, vat_amount, total_amount")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("is_annulled", false)
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

  // Obtener año del período contable activo
  useEffect(() => {
    const fetchActiveYear = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      const activePeriodId = localStorage.getItem("activePeriodId");
      
      if (!currentEnterpriseId) return;

      try {
        if (activePeriodId) {
          // Obtener el año del período activo guardado
          const { data: period } = await supabase
            .from("tab_accounting_periods")
            .select("year")
            .eq("id", parseInt(activePeriodId))
            .single();
          
          if (period) {
            setActiveYear(period.year);
            return;
          }
        }

        // Fallback: buscar el período abierto más reciente
        const { data: periods } = await supabase
          .from("tab_accounting_periods")
          .select("year")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("status", "abierto")
          .order("year", { ascending: false })
          .limit(1);

        if (periods && periods.length > 0) {
          setActiveYear(periods[0].year);
        }
      } catch (error) {
        console.error("Error fetching active year:", error);
      }
    };

    fetchActiveYear();

    // Escuchar cambios en el período activo
    const handlePeriodChange = () => fetchActiveYear();
    window.addEventListener("periodChanged", handlePeriodChange);
    window.addEventListener("storage", handlePeriodChange);

    return () => {
      window.removeEventListener("periodChanged", handlePeriodChange);
      window.removeEventListener("storage", handlePeriodChange);
    };
  }, []);

  // Cargar años disponibles con datos REALES
  useEffect(() => {
    const fetchAvailableYears = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId) return;

      try {
        const yearsSet = new Set<number>();

        // Obtener años de ventas con datos reales (no anuladas)
        const { data: sales } = await supabase
          .from("tab_sales_ledger")
          .select("invoice_date")
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("is_annulled", false);

        sales?.forEach(s => {
          yearsSet.add(new Date(s.invoice_date).getFullYear());
        });

        // Obtener años de compras con datos reales (JOIN con purchase_ledger)
        const { data: purchases } = await supabase
          .from("tab_purchase_ledger")
          .select("invoice_date")
          .eq("enterprise_id", parseInt(currentEnterpriseId));

        purchases?.forEach(p => {
          yearsSet.add(new Date(p.invoice_date).getFullYear());
        });

        const sortedYears = Array.from(yearsSet).sort((a, b) => b - a);
        setAvailableYears(sortedYears);
        
        // Inicializar selección con el año activo
        if (sortedYears.length > 0) {
          if (sortedYears.includes(activeYear)) {
            setSelectedChartYears([activeYear]);
          } else {
            setSelectedChartYears([sortedYears[0]]);
          }
        }
      } catch (error) {
        console.error("Error fetching available years:", error);
      }
    };

    fetchAvailableYears();
  }, [activeYear]);

  // Cargar datos anuales para gráficas (multi-año)
  useEffect(() => {
    const fetchYearlyData = async () => {
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      if (!currentEnterpriseId || selectedChartYears.length === 0) {
        setYearlyChartsLoading(false);
        return;
      }

      setYearlyChartsLoading(true);

      try {
        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

        // Inicializar datos mensuales base
        const initializeMonthlyData = (): MonthlyChartData[] => 
          monthNames.map((month, index) => ({ month, monthNum: index + 1 }));

        const salesByMonth = initializeMonthlyData();
        const purchasesByMonth = initializeMonthlyData();

        // Obtener datos para cada año seleccionado
        for (const year of selectedChartYears) {
          // Fetch ventas del año (excluding annulled invoices)
          const { data: sales } = await supabase
            .from("tab_sales_ledger")
            .select("invoice_date, total_amount")
            .eq("enterprise_id", parseInt(currentEnterpriseId))
            .eq("is_annulled", false)
            .gte("invoice_date", `${year}-01-01`)
            .lte("invoice_date", `${year}-12-31`);

          // Inicializar año con ceros
          salesByMonth.forEach(m => { m[year.toString()] = 0; });

          if (sales) {
            sales.forEach((sale) => {
              const month = new Date(sale.invoice_date).getMonth();
              (salesByMonth[month][year.toString()] as number) += Number(sale.total_amount || 0);
            });
          }

          // Fetch compras del año
          const { data: purchases } = await supabase
            .from("tab_purchase_ledger")
            .select("invoice_date, total_amount")
            .eq("enterprise_id", parseInt(currentEnterpriseId))
            .gte("invoice_date", `${year}-01-01`)
            .lte("invoice_date", `${year}-12-31`);

          // Inicializar año con ceros
          purchasesByMonth.forEach(m => { m[year.toString()] = 0; });

          if (purchases) {
            purchases.forEach((purchase) => {
              const month = new Date(purchase.invoice_date).getMonth();
              (purchasesByMonth[month][year.toString()] as number) += Number(purchase.total_amount || 0);
            });
          }
        }

        setYearlySalesData(salesByMonth);
        setYearlyPurchasesData(purchasesByMonth);
      } catch (error) {
        console.error("Error fetching yearly data:", error);
      } finally {
        setYearlyChartsLoading(false);
      }
    };

    fetchYearlyData();
  }, [selectedChartYears]);

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
      link: "/saldos",
    },
    {
      title: "Total Pasivos",
      value: kpiData ? `Q ${formatNumber(kpiData.totalPasivos.value)}` : "Q 0.00",
      change: kpiData ? formatChange(kpiData.totalPasivos.change) : "N/A",
      trend: kpiData?.totalPasivos?.trend || 'neutral',
      icon: Scale,
      link: "/saldos",
    },
    {
      title: "Utilidad del Período",
      value: kpiData ? `Q ${formatNumber(kpiData.utilidadMes.value)}` : "Q 0.00",
      change: kpiData ? formatChange(kpiData.utilidadMes.change) : "N/A",
      trend: kpiData?.utilidadMes?.trend || 'neutral',
      icon: TrendingUp,
      link: "/reportes",
    },
    {
      title: "Liquidez",
      value: kpiData 
        ? (kpiData.liquidez.value === -1 
            ? "∞"
            : kpiData.liquidez.value.toFixed(2))
        : "0.00",
      change: kpiData 
        ? (kpiData.liquidez.value === -1 
            ? "Sin pasivo corriente" 
            : formatChange(kpiData.liquidez.change, false)) 
        : "N/A",
      trend: kpiData?.liquidez?.trend || 'neutral',
      icon: Wallet,
      link: "/saldos",
    },
  ];

  const displayedEntries = recentEntries.length > 0 ? recentEntries : [
    { id: 1, number: "-", date: "-", description: "No hay partidas registradas", amount: "Q 0.00" }
  ];

  const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");

  // Formatear fechas del período para mostrar
  const formatPeriodDisplay = (): string => {
    if (!activePeriod) return "Sin período activo";
    
    // Agregar T00:00:00 para evitar desfase de zona horaria
    const startDate = new Date(activePeriod.start_date + "T00:00:00");
    const endDate = new Date(activePeriod.end_date + "T00:00:00");
    
    const formatDate = (date: Date) => {
      const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      return `${months[date.getMonth()]} ${date.getFullYear()}`;
    };
    
    const startFormatted = formatDate(startDate);
    const endFormatted = formatDate(endDate);
    
    if (startFormatted === endFormatted) {
      return startFormatted;
    }
    return `${startFormatted} - ${endFormatted}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Resumen general de tu información contable
          </p>
        </div>
        
        {/* Indicador del período activo */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <Calendar className="h-4 w-4 text-primary" />
          <div className="text-sm">
            <span className="text-muted-foreground">Período: </span>
            <span className="font-semibold text-primary">
              {activePeriod ? `${activePeriod.year}` : "Sin período"}
            </span>
            {activePeriod && (
              <span className="text-xs text-muted-foreground ml-2">
                ({formatPeriodDisplay()})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card 
            key={kpi.title}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => navigate(kpi.link)}
          >
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
                    {kpi.change} vs período anterior
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary KPIs Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <DashboardPendingEntries enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null} />
        <DashboardBankBalances enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null} />
        <DashboardIVASummary enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null} />
        <DashboardTaxDeadlines enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null} />
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

        <DashboardAlerts enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null} />
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
                  {selectedChartYears.length === 1 
                    ? `Total mensual de ventas ${selectedChartYears[0]}`
                    : `Comparativa mensual: ${selectedChartYears.sort((a, b) => b - a).join(', ')}`
                  }
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {availableYears.length > 1 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1">
                        {selectedChartYears.length === 1 
                          ? selectedChartYears[0]
                          : `${selectedChartYears.length} años`
                        }
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" align="end">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground mb-2">Selecciona años a comparar</p>
                        {availableYears.map((year, index) => (
                          <div 
                            key={year} 
                            className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                            onClick={() => {
                              if (selectedChartYears.includes(year)) {
                                // No permitir deseleccionar el único año
                                if (selectedChartYears.length > 1) {
                                  setSelectedChartYears(selectedChartYears.filter(y => y !== year));
                                }
                              } else {
                                // Máximo 5 años
                                if (selectedChartYears.length < 5) {
                                  setSelectedChartYears([...selectedChartYears, year]);
                                }
                              }
                            }}
                          >
                            <Checkbox 
                              checked={selectedChartYears.includes(year)} 
                              className="pointer-events-none"
                            />
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: selectedChartYears.includes(year) ? YEAR_COLORS[selectedChartYears.indexOf(year) % YEAR_COLORS.length] : 'transparent', border: '1px solid hsl(var(--border))' }}
                            />
                            <span className="text-sm">{year}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <Receipt className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {yearlyChartsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : yearlySalesData.some(d => selectedChartYears.some(y => (d[y.toString()] as number) > 0)) ? (
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
                      formatter={(value: number, name: string) => [`Q ${formatNumber(value)}`, name]}
                      labelFormatter={(label) => `Mes: ${label}`}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    {selectedChartYears.length > 1 && <Legend />}
                    {selectedChartYears.sort((a, b) => b - a).map((year, index) => (
                      <Line 
                        key={year}
                        type="monotone" 
                        dataKey={year.toString()}
                        name={year.toString()}
                        stroke={YEAR_COLORS[index % YEAR_COLORS.length]} 
                        strokeWidth={2}
                        dot={{ fill: YEAR_COLORS[index % YEAR_COLORS.length], strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No hay ventas registradas</p>
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
                  {selectedChartYears.length === 1 
                    ? `Total mensual de compras ${selectedChartYears[0]}`
                    : `Comparativa mensual: ${selectedChartYears.sort((a, b) => b - a).join(', ')}`
                  }
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {availableYears.length > 1 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1">
                        {selectedChartYears.length === 1 
                          ? selectedChartYears[0]
                          : `${selectedChartYears.length} años`
                        }
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-2" align="end">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground mb-2">Selecciona años a comparar</p>
                        {availableYears.map((year, index) => (
                          <div 
                            key={year} 
                            className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                            onClick={() => {
                              if (selectedChartYears.includes(year)) {
                                if (selectedChartYears.length > 1) {
                                  setSelectedChartYears(selectedChartYears.filter(y => y !== year));
                                }
                              } else {
                                if (selectedChartYears.length < 5) {
                                  setSelectedChartYears([...selectedChartYears, year]);
                                }
                              }
                            }}
                          >
                            <Checkbox 
                              checked={selectedChartYears.includes(year)} 
                              className="pointer-events-none"
                            />
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: selectedChartYears.includes(year) ? YEAR_COLORS[selectedChartYears.indexOf(year) % YEAR_COLORS.length] : 'transparent', border: '1px solid hsl(var(--border))' }}
                            />
                            <span className="text-sm">{year}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <ShoppingCart className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {yearlyChartsLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : yearlyPurchasesData.some(d => selectedChartYears.some(y => (d[y.toString()] as number) > 0)) ? (
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
                      formatter={(value: number, name: string) => [`Q ${formatNumber(value)}`, name]}
                      labelFormatter={(label) => `Mes: ${label}`}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    {selectedChartYears.length > 1 && <Legend />}
                    {selectedChartYears.sort((a, b) => b - a).map((year, index) => (
                      <Line 
                        key={year}
                        type="monotone" 
                        dataKey={year.toString()}
                        name={year.toString()}
                        stroke={YEAR_COLORS[index % YEAR_COLORS.length]} 
                        strokeWidth={2}
                        dot={{ fill: YEAR_COLORS[index % YEAR_COLORS.length], strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No hay compras registradas</p>
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

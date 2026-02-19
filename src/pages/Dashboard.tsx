import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, Calendar, ShoppingCart, Receipt, Scale, Wallet, ChevronDown, Settings } from "lucide-react";
import { FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DashboardAlerts } from "@/components/dashboard/DashboardAlerts";
import { DashboardPendingEntries } from "@/components/dashboard/DashboardPendingEntries";
import { DashboardIVASummary } from "@/components/dashboard/DashboardIVASummary";
import { DashboardBankBalances } from "@/components/dashboard/DashboardBankBalances";
import { DashboardTaxDeadlines } from "@/components/dashboard/DashboardTaxDeadlines";
import { DashboardISRMensualSummary } from "@/components/dashboard/DashboardISRMensualSummary";
import { DashboardISRTrimestralProjection } from "@/components/dashboard/DashboardISRTrimestralProjection";
import { DashboardTaxSummary } from "@/components/dashboard/DashboardTaxSummary";
import { DashboardCardConfigDialog } from "@/components/dashboard/DashboardCardConfigDialog";
import { useDashboardTaxData } from "@/hooks/useDashboardTaxData";
import { CARD_REGISTRY, DEFAULT_VISIBLE_CARDS } from "@/constants/dashboardCards";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { formatGTQ, formatChange } from "@/domain/accounting/calculations";
import { useActivePeriod } from "@/hooks/dashboard/useActivePeriod";
import { useKpis } from "@/hooks/dashboard/useKpis";
import { useBookSummaries } from "@/hooks/dashboard/useBookSummaries";
import { useYearlyCharts, fetchAvailableChartYears } from "@/hooks/dashboard/useYearlyCharts";
import { useRecentEntries } from "@/hooks/dashboard/useRecentEntries";
import type { BookSummary } from "@/hooks/dashboard/useBookSummaries";

const YEAR_COLORS = [
  "hsl(var(--success))",
  "hsl(var(--primary))",
  "hsl(220, 70%, 50%)",
  "hsl(280, 70%, 50%)",
  "hsl(30, 80%, 55%)",
];

const getMonthName = (month: number): string => {
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return months[month - 1] || "";
};

const formatPeriodDisplay = (period: { start_date: string; end_date: string } | null): string => {
  if (!period) return "Sin período activo";
  const fmt = (d: Date) => {
    const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  };
  const start = new Date(period.start_date + "T00:00:00");
  const end   = new Date(period.end_date   + "T00:00:00");
  const s = fmt(start);
  const e = fmt(end);
  return s === e ? s : `${s} - ${e}`;
};

// ---------------------------------------------------------------------------
// BookSummaryCard — extracted pure presentational component
// ---------------------------------------------------------------------------
interface BookSummaryCardProps {
  title: string;
  summary: BookSummary | null | undefined;
  loading: boolean;
  icon: React.ElementType;
  totalColorClass: string;
}

function BookSummaryCard({ title, summary, loading, icon: Icon, totalColorClass }: BookSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {summary ? `${getMonthName(summary.month)} ${summary.year}` : "No hay registros"}
            </CardDescription>
          </div>
          <Icon className={`h-8 w-8 ${totalColorClass}`} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : summary ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Base:</span>
              <span className="text-lg font-semibold financial-number">Q {formatGTQ(summary.base)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">IVA:</span>
              <span className="text-lg font-semibold financial-number">Q {formatGTQ(summary.vat)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-medium">Total:</span>
              <span className={`text-xl font-bold financial-number ${totalColorClass}`}>
                Q {formatGTQ(summary.total)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">Cantidad de documentos:</span>
              <span className="text-lg font-semibold">{summary.count}</span>
            </div>
            {summary.percentageChange !== undefined && (
              <div className="flex justify-between items-center pt-2 mt-2 border-t">
                <span className="text-xs text-muted-foreground">vs mes anterior</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: (summary.percentageChange >= 0) === (title.includes("Ventas"))
                    ? "hsl(var(--success))" : "hsl(var(--destructive))" }}
                >
                  {summary.percentageChange >= 0 ? "+" : ""}
                  {summary.percentageChange.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No hay registros</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// YearlyChart — extracted pure presentational component
// ---------------------------------------------------------------------------
interface YearlyChartProps {
  title: string;
  description: string;
  data: Array<{ month: string; monthNum: number; [key: string]: number | string }>;
  loading: boolean;
  selectedYears: number[];
  availableYears: number[];
  onYearsChange: (years: number[]) => void;
  icon: React.ElementType;
  emptyMessage: string;
}

function YearlyChart({ title, description, data, loading, selectedYears, availableYears, onYearsChange, icon: Icon, emptyMessage }: YearlyChartProps) {
  const hasData = data.some(d => selectedYears.some(y => (d[y.toString()] as number) > 0));
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {availableYears.length > 1 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1">
                    {selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} años`}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="end">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground mb-2">Selecciona años a comparar</p>
                    {availableYears.map((year) => (
                      <div
                        key={year}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-muted cursor-pointer"
                        onClick={() => {
                          if (selectedYears.includes(year)) {
                            if (selectedYears.length > 1) onYearsChange(selectedYears.filter(y => y !== year));
                          } else if (selectedYears.length < 5) {
                            onYearsChange([...selectedYears, year]);
                          }
                        }}
                      >
                        <Checkbox checked={selectedYears.includes(year)} className="pointer-events-none" />
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: selectedYears.includes(year) ? YEAR_COLORS[selectedYears.indexOf(year) % YEAR_COLORS.length] : 'transparent', border: '1px solid hsl(var(--border))' }}
                        />
                        <span className="text-sm">{year}</span>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[200px] w-full" />
        ) : hasData ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} className="text-muted-foreground" />
                <Tooltip
                  formatter={(value: number, name: string) => [`Q ${formatGTQ(value)}`, name]}
                  labelFormatter={(label) => `Mes: ${label}`}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
                {selectedYears.length > 1 && <Legend />}
                {selectedYears.sort((a, b) => b - a).map((year, idx) => (
                  <Line
                    key={year} type="monotone" dataKey={year.toString()} name={year.toString()}
                    stroke={YEAR_COLORS[idx % YEAR_COLORS.length]} strokeWidth={2}
                    dot={{ fill: YEAR_COLORS[idx % YEAR_COLORS.length], strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            <p className="text-sm">{emptyMessage}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — main component (now <300 lines of logic)
// ---------------------------------------------------------------------------
const Dashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCardConfig, setShowCardConfig] = useState(false);
  const [selectedChartYears, setSelectedChartYears] = useState<number[]>([new Date().getFullYear()]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  const currentEnterpriseIdStr = localStorage.getItem("currentEnterpriseId");
  const currentEntId = currentEnterpriseIdStr ? parseInt(currentEnterpriseIdStr) : null;

  // ── Data hooks ──────────────────────────────────────────────────────────
  const { activePeriod } = useActivePeriod(currentEntId);
  const { data: kpiData, isLoading: kpiLoading } = useKpis(currentEntId, activePeriod);
  const { data: bookData, isLoading: bookLoading } = useBookSummaries(currentEntId);
  const { data: chartData, isLoading: chartLoading } = useYearlyCharts(currentEntId, selectedChartYears);
  const { data: recentEntries } = useRecentEntries(currentEntId);
  const taxData = useDashboardTaxData(currentEntId);

  // Card config
  const { data: cardConfig } = useQuery({
    queryKey: ["dashboard-card-config", currentEntId],
    queryFn: async () => {
      if (!currentEntId) return null;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("tab_dashboard_card_config")
        .select("visible_cards, card_order")
        .eq("enterprise_id", currentEntId)
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentEntId,
  });
  const visibleCards: string[] = (cardConfig?.visible_cards as string[]) || DEFAULT_VISIBLE_CARDS;

  // Fetch available years for chart year selector
  useEffect(() => {
    if (!currentEntId) return;
    fetchAvailableChartYears(currentEntId).then((years) => {
      setAvailableYears(years);
      if (years.length > 0 && !years.includes(selectedChartYears[0])) {
        setSelectedChartYears([years[0]]);
      }
    });
  }, [currentEntId]);

  // ── KPI display ─────────────────────────────────────────────────────────
  const kpis = [
    { title: "Total Activos",       value: kpiData ? `Q ${formatGTQ(kpiData.totalActivos.value)}`    : "Q 0.00", change: formatChange(kpiData?.totalActivos.change),    trend: kpiData?.totalActivos.trend    || 'neutral', icon: DollarSign, link: "/saldos" },
    { title: "Total Pasivos",       value: kpiData ? `Q ${formatGTQ(kpiData.totalPasivos.value)}`    : "Q 0.00", change: formatChange(kpiData?.totalPasivos.change),    trend: kpiData?.totalPasivos.trend    || 'neutral', icon: Scale,      link: "/saldos" },
    { title: "Utilidad del Período",value: kpiData ? `Q ${formatGTQ(kpiData.utilidadPeriodo.value)}` : "Q 0.00", change: formatChange(kpiData?.utilidadPeriodo.change), trend: kpiData?.utilidadPeriodo.trend || 'neutral', icon: TrendingUp,  link: "/reportes" },
    {
      title: "Liquidez",
      value: kpiData ? (kpiData.liquidez.value === -1 ? "∞" : kpiData.liquidez.value.toFixed(2)) : "0.00",
      change: kpiData ? (kpiData.liquidez.value === -1 ? "Sin pasivo corriente" : formatChange(kpiData.liquidez.change, false)) : "N/A",
      trend: kpiData?.liquidez.trend || 'neutral', icon: Wallet, link: "/saldos"
    },
  ];

  const displayedEntries = recentEntries?.length
    ? recentEntries
    : [{ id: 0, number: "-", date: "-", description: "No hay partidas registradas", amount: "Q 0.00" }];

  const chartDesc = (label: string) =>
    selectedChartYears.length === 1
      ? `Total mensual de ${label} ${selectedChartYears[0]}`
      : `Comparativa mensual: ${selectedChartYears.sort((a, b) => b - a).join(', ')}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Resumen general de tu información contable</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setShowCardConfig(true)}>
            <Settings className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <Calendar className="h-4 w-4 text-primary" />
            <div className="text-sm">
              <span className="text-muted-foreground">Período: </span>
              <span className="font-semibold text-primary">{activePeriod ? `${activePeriod.year}` : "Sin período"}</span>
              {activePeriod && <span className="text-xs text-muted-foreground ml-2">({formatPeriodDisplay(activePeriod)})</span>}
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(kpi.link)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {kpiLoading ? (
                <><Skeleton className="h-8 w-3/4 mb-2" /><Skeleton className="h-4 w-1/2" /></>
              ) : (
                <>
                  <div className="text-2xl font-bold financial-number">{kpi.value}</div>
                  <p className={`text-xs ${kpi.trend === "up" ? "text-success" : kpi.trend === "down" ? "text-destructive" : "text-muted-foreground"}`}>
                    {kpi.change} vs período anterior
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Secondary cards (tax / bank / etc.) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {visibleCards.includes('partidas_pendientes')      && <DashboardPendingEntries enterpriseId={currentEntId} />}
        {visibleCards.includes('saldos_bancarios')         && <DashboardBankBalances enterpriseId={currentEntId} />}
        {visibleCards.includes('resumen_iva')              && <DashboardIVASummary ivaData={taxData.ivaData} loading={taxData.loading} monthName={taxData.monthName} year={taxData.referenceYear} />}
        {visibleCards.includes('proximos_vencimientos')    && <DashboardTaxDeadlines enterpriseId={currentEntId} />}
        {visibleCards.includes('resumen_isr_mensual')      && <DashboardISRMensualSummary data={taxData.isrMensualData} loading={taxData.loading} monthName={taxData.monthName} year={taxData.referenceYear} />}
        {visibleCards.includes('proyeccion_isr_trimestral')&& <DashboardISRTrimestralProjection data={taxData.isrTrimestralData} loading={taxData.loading} />}
        {visibleCards.includes('resumen_impuestos')        && <DashboardTaxSummary taxSummary={taxData.taxSummary} totalTaxEstimate={taxData.totalTaxEstimate} loading={taxData.loading} />}
      </div>

      {/* Recent entries + alerts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Últimas Partidas Contabilizadas</CardTitle>
            <CardDescription>Movimientos más recientes en el sistema</CardDescription>
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
        <DashboardAlerts enterpriseId={currentEntId} />
      </div>

      {/* Book summaries */}
      <div className="grid gap-4 md:grid-cols-2">
        <BookSummaryCard title="Último Mes de Ventas"  summary={bookData?.sales}     loading={bookLoading} icon={Receipt}      totalColorClass="text-success" />
        <BookSummaryCard title="Último Mes de Compras" summary={bookData?.purchases}  loading={bookLoading} icon={ShoppingCart} totalColorClass="text-destructive" />
      </div>

      {/* Yearly charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <YearlyChart title="Ventas del Año"  description={chartDesc("ventas")}  data={chartData?.salesData ?? []}     loading={chartLoading} selectedYears={selectedChartYears} availableYears={availableYears} onYearsChange={setSelectedChartYears} icon={Receipt}      emptyMessage="No hay ventas registradas" />
        <YearlyChart title="Compras del Año" description={chartDesc("compras")} data={chartData?.purchasesData ?? []} loading={chartLoading} selectedYears={selectedChartYears} availableYears={availableYears} onYearsChange={setSelectedChartYears} icon={ShoppingCart} emptyMessage="No hay compras registradas" />
      </div>

      <DashboardCardConfigDialog
        open={showCardConfig}
        onOpenChange={setShowCardConfig}
        enterpriseId={currentEntId}
        taxConfigs={taxData.taxConfigs}
        currentVisibleCards={visibleCards}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["dashboard-card-config"] })}
      />
    </div>
  );
};

export default Dashboard;

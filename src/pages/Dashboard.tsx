import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Building2, FileText, Calendar, ShoppingCart, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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

const Dashboard = () => {
  const [purchaseSummary, setPurchaseSummary] = useState<BookSummary | null>(null);
  const [salesSummary, setSalesSummary] = useState<BookSummary | null>(null);
  const [loading, setLoading] = useState(true);

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
          // Buscar el libro más reciente que tenga datos
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

            // Calcular cambio porcentual con el mes anterior que tenga datos
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
          // Group by month/year and get the most recent two months
          const grouped: { [key: string]: BookSummary } = sales.reduce((acc: any, curr) => {
            const date = new Date(curr.invoice_date);
            const key = `${date.getFullYear()}-${date.getMonth()}`;
            if (!acc[key]) {
              acc[key] = {
                month: date.getMonth() + 1,
                year: date.getFullYear(),
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
            
            // Calculate percentage change with previous month
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

  // Mock data for demonstration
  const kpis = [
    {
      title: "Total Activos",
      value: "Q 1,250,450.00",
      change: "+12.5%",
      trend: "up",
      icon: DollarSign,
    },
    {
      title: "Total Pasivos",
      value: "Q 450,230.00",
      change: "-3.2%",
      trend: "down",
      icon: TrendingDown,
    },
    {
      title: "Utilidad del Mes",
      value: "Q 85,340.00",
      change: "+8.3%",
      trend: "up",
      icon: TrendingUp,
    },
    {
      title: "Liquidez",
      value: "2.78",
      change: "+0.15",
      trend: "up",
      icon: DollarSign,
    },
  ];

  const recentEntries = [
    { id: 1, number: "2025-001", date: "2025-01-15", description: "Compra de equipo de oficina", amount: "Q 5,600.00" },
    { id: 2, number: "2025-002", date: "2025-01-16", description: "Venta de servicios", amount: "Q 12,500.00" },
    { id: 3, number: "2025-003", date: "2025-01-17", description: "Pago de salarios", amount: "Q 35,000.00" },
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
              <div className="text-2xl font-bold financial-number">{kpi.value}</div>
              <p className={`text-xs ${kpi.trend === "up" ? "text-success" : "text-muted-foreground"}`}>
                {kpi.change} vs mes anterior
              </p>
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
              {recentEntries.map((entry) => (
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
                    Q {salesSummary.base.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">IVA:</span>
                  <span className="text-lg font-semibold financial-number">
                    Q {salesSummary.vat.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-xl font-bold text-success financial-number">
                    Q {salesSummary.total.toFixed(2)}
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
                    Q {purchaseSummary.base.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">IVA:</span>
                  <span className="text-lg font-semibold financial-number">
                    Q {purchaseSummary.vat.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-xl font-bold text-destructive financial-number">
                    Q {purchaseSummary.total.toFixed(2)}
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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Building2, FileText, Calendar } from "lucide-react";

const Dashboard = () => {
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

      {/* Chart placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Ingresos vs Gastos</CardTitle>
          <CardDescription>
            Comparación mensual de los últimos 12 meses
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <p>Gráfico de Ingresos vs Gastos (próximamente)</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;

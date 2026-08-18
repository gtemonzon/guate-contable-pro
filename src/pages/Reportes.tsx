import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, BarChart3, FolderOpen } from "lucide-react";
import ReporteCompras from "@/components/reportes/ReporteCompras";
import ReporteVentas from "@/components/reportes/ReporteVentas";
import ReporteComprasVentas from "@/components/reportes/ReporteComprasVentas";
import ReportePartidas from "@/components/reportes/ReportePartidas";
import ReporteBalanceGeneral from "@/components/reportes/ReporteBalanceGeneral";
import ReporteEstadoResultados from "@/components/reportes/ReporteEstadoResultados";
import ReporteLibroMayor from "@/components/reportes/ReporteLibroMayor";
import ReporteLibroBancos from "@/components/reportes/ReporteLibroBancos";
import ReporteVariaciones from "@/components/reportes/ReporteVariaciones";
import ReporteFacturasPorCuenta from "@/components/reportes/ReporteFacturasPorCuenta";
import ReporteFlujoEfectivo from "@/components/reportes/ReporteFlujoEfectivo";
import ReporteSaldos from "@/components/reportes/ReporteSaldos";
import { useEnterpriseTaxRegime } from "@/hooks/useEnterpriseTaxRegime";

type SubTab = {
  value: string;
  label: string;
  render: () => JSX.Element;
  bare?: boolean;
};

type Category = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabs: SubTab[];
};

export default function Reportes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { strategy } = useEnterpriseTaxRegime();
  const combined = strategy.combinedBook;

  const categories: Category[] = useMemo(
    () => [
      {
        value: "libros",
        label: "Libros",
        icon: BookOpen,
        tabs: [
          ...(combined
            ? [{ value: "compras-ventas", label: "Compras y Ventas", render: () => <ReporteComprasVentas /> }]
            : [
                { value: "compras", label: "Compras", render: () => <ReporteCompras /> },
                { value: "ventas", label: "Ventas", render: () => <ReporteVentas /> },
              ]),
          { value: "partidas", label: "Partidas", render: () => <ReportePartidas /> },
          { value: "mayor", label: "Mayor", render: () => <ReporteLibroMayor /> },
          { value: "bancos", label: "Bancos", render: () => <ReporteLibroBancos /> },
        ],
      },
      {
        value: "estados",
        label: "Estados Financieros",
        icon: BarChart3,
        tabs: [
          { value: "balance", label: "Balance", render: () => <ReporteBalanceGeneral /> },
          { value: "resultados", label: "Resultados", render: () => <ReporteEstadoResultados /> },
          { value: "variaciones", label: "Variaciones", render: () => <ReporteVariaciones /> },
          { value: "flujo-efectivo", label: "Flujo de Efectivo", render: () => <ReporteFlujoEfectivo /> },
        ],
      },
      {
        value: "otros",
        label: "Otros",
        icon: FolderOpen,
        tabs: [
          { value: "saldos", label: "Saldos", render: () => <ReporteSaldos />, bare: true },
          { value: "facturas-por-cuenta", label: "Fact x Cta", render: () => <ReporteFacturasPorCuenta /> },
        ],
      },
    ],
    [combined]
  );

  // Coerce stale tabs to the regime-appropriate one
  const rawTab = searchParams.get("tab");
  const requestedTab =
    combined && (rawTab === "compras" || rawTab === "ventas")
      ? "compras-ventas"
      : !combined && rawTab === "compras-ventas"
      ? "compras"
      : rawTab;

  // Single consistent derivation of (category, subTab) from the URL
  const derived = useMemo(() => {
    const found = requestedTab
      ? categories.find((c) => c.tabs.some((t) => t.value === requestedTab))
      : undefined;
    if (found && requestedTab) {
      return { category: found.value, subTab: requestedTab };
    }
    const first = categories[0];
    return { category: first?.value ?? "libros", subTab: first?.tabs[0]?.value ?? "" };
  }, [requestedTab, categories]);

  // Local override lets the user switch level-1 category without a URL tab yet
  const [categoryOverride, setCategoryOverride] = useState<string | null>(null);

  const category = categoryOverride ?? derived.category;
  const currentCategory = categories.find((c) => c.value === category) ?? categories[0];
  const subTab =
    currentCategory?.tabs.find((t) => t.value === derived.subTab)?.value ||
    currentCategory?.tabs[0]?.value ||
    "";

  // Reset the override whenever the URL points to a concrete tab
  useEffect(() => {
    setCategoryOverride(null);
  }, [derived.category, derived.subTab]);

  const handleCategoryChange = (value: string) => {
    setCategoryOverride(value);
    const target = categories.find((c) => c.value === value)?.tabs[0]?.value;
    if (target) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", target);
      setSearchParams(next, { replace: true });
    }
  };

  const handleSubTabChange = (value: string) => {
    setCategoryOverride(null);
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  if (!currentCategory) return null;


  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">
          Libros contables, estados financieros y consultas de saldos
        </p>
      </div>

      {/* Level 1: Categories */}
      <Tabs value={category} onValueChange={handleCategoryChange} className="w-full">
        <TabsList className="flex-wrap h-auto">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <TabsTrigger key={c.value} value={c.value} className="gap-2">
                <Icon className="h-4 w-4" />
                {c.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Level 2: Sub-tabs of the selected category */}
      <div className="mt-6">
        <Tabs value={subTab} onValueChange={handleSubTabChange} className="w-full">
          <TabsList className="flex-wrap h-auto bg-muted/50">
            {currentCategory.tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {currentCategory.tabs.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-6">
              {t.bare ? t.render() : <Card><CardContent className="pt-6">{t.render()}</CardContent></Card>}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

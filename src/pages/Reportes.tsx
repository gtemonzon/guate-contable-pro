import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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
import { useEnterpriseTaxRegime } from "@/hooks/useEnterpriseTaxRegime";

export default function Reportes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { strategy } = useEnterpriseTaxRegime();
  const combined = strategy.combinedBook;
  const defaultTab = combined ? "compras-ventas" : "compras";
  const rawTab = searchParams.get("tab") || defaultTab;
  // Coerce stale tabs to the regime-appropriate one
  const activeTab =
    combined && (rawTab === "compras" || rawTab === "ventas")
      ? "compras-ventas"
      : !combined && rawTab === "compras-ventas"
      ? "compras"
      : rawTab;

  const handleTabChange = (value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set("tab", value);
      return next;
    });
  };

  const gridCols = combined ? "grid-cols-8" : "grid-cols-9";

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">
          Genera reportes de compras, ventas, partidas, estados financieros y bancos
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className={`grid w-full max-w-7xl ${gridCols} divide-x divide-border/60`}>
          {combined ? (
            <TabsTrigger value="compras-ventas">Compras y Ventas</TabsTrigger>
          ) : (
            <>
              <TabsTrigger value="compras">Compras</TabsTrigger>
              <TabsTrigger value="ventas">Ventas</TabsTrigger>
            </>
          )}
          <TabsTrigger value="partidas">Partidas</TabsTrigger>
          <TabsTrigger value="mayor">Mayor</TabsTrigger>
          <TabsTrigger value="bancos">Bancos</TabsTrigger>
          <TabsTrigger value="balance">Balance</TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
          <TabsTrigger value="variaciones">Variaciones</TabsTrigger>
          <TabsTrigger value="facturas-por-cuenta">Fact x Cta</TabsTrigger>
        </TabsList>

        {combined ? (
          <TabsContent value="compras-ventas">
            <Card><CardContent className="pt-6"><ReporteComprasVentas /></CardContent></Card>
          </TabsContent>
        ) : (
          <>
            <TabsContent value="compras">
              <Card><CardContent className="pt-6"><ReporteCompras /></CardContent></Card>
            </TabsContent>
            <TabsContent value="ventas">
              <Card><CardContent className="pt-6"><ReporteVentas /></CardContent></Card>
            </TabsContent>
          </>
        )}
        <TabsContent value="partidas">
          <Card><CardContent className="pt-6"><ReportePartidas /></CardContent></Card>
        </TabsContent>
        <TabsContent value="mayor">
          <Card><CardContent className="pt-6"><ReporteLibroMayor /></CardContent></Card>
        </TabsContent>
        <TabsContent value="bancos">
          <Card><CardContent className="pt-6"><ReporteLibroBancos /></CardContent></Card>
        </TabsContent>
        <TabsContent value="balance">
          <Card><CardContent className="pt-6"><ReporteBalanceGeneral /></CardContent></Card>
        </TabsContent>
        <TabsContent value="resultados">
          <Card><CardContent className="pt-6"><ReporteEstadoResultados /></CardContent></Card>
        </TabsContent>
        <TabsContent value="variaciones">
          <Card><CardContent className="pt-6"><ReporteVariaciones /></CardContent></Card>
        </TabsContent>
        <TabsContent value="facturas-por-cuenta">
          <Card><CardContent className="pt-6"><ReporteFacturasPorCuenta /></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

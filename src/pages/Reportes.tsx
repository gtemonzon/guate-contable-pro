import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import ReporteCompras from "@/components/reportes/ReporteCompras";
import ReporteVentas from "@/components/reportes/ReporteVentas";
import ReportePartidas from "@/components/reportes/ReportePartidas";
import ReporteBalanceGeneral from "@/components/reportes/ReporteBalanceGeneral";
import ReporteEstadoResultados from "@/components/reportes/ReporteEstadoResultados";
import ReporteLibroMayor from "@/components/reportes/ReporteLibroMayor";

export default function Reportes() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">Genera reportes de compras, ventas, partidas y estados financieros</p>
      </div>

      <Tabs defaultValue="compras" className="space-y-6">
        <TabsList className="grid w-full max-w-4xl grid-cols-6">
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="partidas">Partidas</TabsTrigger>
          <TabsTrigger value="mayor">Mayor</TabsTrigger>
          <TabsTrigger value="balance">Balance</TabsTrigger>
          <TabsTrigger value="resultados">Resultados</TabsTrigger>
        </TabsList>

        <TabsContent value="compras">
          <Card>
            <CardContent className="pt-6">
              <ReporteCompras />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ventas">
          <Card>
            <CardContent className="pt-6">
              <ReporteVentas />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partidas">
          <Card>
            <CardContent className="pt-6">
              <ReportePartidas />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mayor">
          <Card>
            <CardContent className="pt-6">
              <ReporteLibroMayor />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balance">
          <Card>
            <CardContent className="pt-6">
              <ReporteBalanceGeneral />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resultados">
          <Card>
            <CardContent className="pt-6">
              <ReporteEstadoResultados />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import ReporteCompras from "@/components/reportes/ReporteCompras";
import ReporteVentas from "@/components/reportes/ReporteVentas";
import ReportePartidas from "@/components/reportes/ReportePartidas";

export default function Reportes() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">Genera reportes de compras, ventas y partidas contables</p>
      </div>

      <Tabs defaultValue="compras" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="partidas">Partidas</TabsTrigger>
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
      </Tabs>
    </div>
  );
}

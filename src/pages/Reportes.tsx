import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import ReporteCompras from "@/components/reportes/ReporteCompras";
import ReporteVentas from "@/components/reportes/ReporteVentas";
import ReportePartidas from "@/components/reportes/ReportePartidas";
import ReporteBalanceGeneral from "@/components/reportes/ReporteBalanceGeneral";
import ReporteEstadoResultados from "@/components/reportes/ReporteEstadoResultados";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Reportes() {
  const navigate = useNavigate();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">Genera reportes de compras, ventas, partidas y estados financieros</p>
      </div>

      <Tabs defaultValue="compras" className="space-y-6">
        <TabsList className="grid w-full max-w-3xl grid-cols-5">
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="partidas">Partidas</TabsTrigger>
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

      <div className="flex gap-4">
        <Button variant="outline" onClick={() => navigate("/balance-saldos")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Ver Balance de Saldos
        </Button>
        <Button variant="outline" onClick={() => navigate("/mayor-general")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Ver Mayor General
        </Button>
      </div>
    </div>
  );
}

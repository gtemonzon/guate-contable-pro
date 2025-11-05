import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OperationTypesManager } from "@/components/configuracion/OperationTypesManager";
import { FelDocumentTypesManager } from "@/components/configuracion/FelDocumentTypesManager";

export default function Configuracion() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          Administra los catálogos y configuraciones del sistema
        </p>
      </div>

      <Tabs defaultValue="operation-types" className="w-full">
        <TabsList>
          <TabsTrigger value="operation-types">Tipos de Operaciones</TabsTrigger>
          <TabsTrigger value="fel-documents">Documentos FEL</TabsTrigger>
        </TabsList>

        <TabsContent value="operation-types" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Operaciones</CardTitle>
              <CardDescription>
                Gestiona los tipos de operaciones para compras y ventas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OperationTypesManager />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fel-documents" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Tipos de Documentos FEL</CardTitle>
              <CardDescription>
                Gestiona los tipos de documentos electrónicos según normativa guatemalteca
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FelDocumentTypesManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

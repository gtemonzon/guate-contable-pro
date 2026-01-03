import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OperationTypesManager } from "@/components/configuracion/OperationTypesManager";
import { FelDocumentTypesManager } from "@/components/configuracion/FelDocumentTypesManager";
import { JournalEntryPrefixesManager } from "@/components/configuracion/JournalEntryPrefixesManager";
import { EnterpriseAccountsManager } from "@/components/configuracion/EnterpriseAccountsManager";
import { FinancialStatementDesigner } from "@/components/configuracion/FinancialStatementDesigner";
import { EnterpriseTaxConfigManager } from "@/components/configuracion/EnterpriseTaxConfigManager";

export default function Configuracion() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          Administra los catálogos y configuraciones del sistema
        </p>
      </div>

      <Tabs defaultValue="enterprise-accounts" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="enterprise-accounts">Cuentas Contables</TabsTrigger>
          <TabsTrigger value="financial-statements">Estados Financieros</TabsTrigger>
          <TabsTrigger value="tax-forms">Formularios de Impuestos</TabsTrigger>
          <TabsTrigger value="operation-types">Tipos de Operaciones</TabsTrigger>
          <TabsTrigger value="fel-documents">Documentos FEL</TabsTrigger>
          <TabsTrigger value="journal-prefixes">Prefijos de Partidas</TabsTrigger>
        </TabsList>

        <TabsContent value="enterprise-accounts" className="mt-6">
          <EnterpriseAccountsManager />
        </TabsContent>

        <TabsContent value="financial-statements" className="mt-6">
          <FinancialStatementDesigner />
        </TabsContent>

        <TabsContent value="tax-forms" className="mt-6">
          <EnterpriseTaxConfigManager />
        </TabsContent>

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

        <TabsContent value="journal-prefixes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Prefijos de Partidas</CardTitle>
              <CardDescription>
                Personaliza los prefijos para identificar los diferentes tipos de partidas contables
              </CardDescription>
            </CardHeader>
            <CardContent>
              <JournalEntryPrefixesManager />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

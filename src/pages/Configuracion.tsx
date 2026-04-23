import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OperationTypesManager } from "@/components/configuracion/OperationTypesManager";
import { FelDocumentTypesManager } from "@/components/configuracion/FelDocumentTypesManager";
import { JournalEntryPrefixesManager } from "@/components/configuracion/JournalEntryPrefixesManager";
import { EnterpriseAccountsManager } from "@/components/configuracion/EnterpriseAccountsManager";
import { FinancialStatementDesigner } from "@/components/configuracion/FinancialStatementDesigner";
import { EnterpriseTaxConfigManager } from "@/components/configuracion/EnterpriseTaxConfigManager";
import { PermissionsMatrix } from "@/components/configuracion/PermissionsMatrix";
import { AlertConfigManager } from "@/components/configuracion/AlertConfigManager";
import { TaxDueDateConfig } from "@/components/configuracion/TaxDueDateConfig";
import { HolidaysManager } from "@/components/configuracion/HolidaysManager";
import { PdfTypographyManager } from "@/components/configuracion/PdfTypographyManager";
import { BackupRestoreManager } from "@/components/configuracion/BackupRestoreManager";
import { IntegrityValidationPanel } from "@/components/configuracion/IntegrityValidationPanel";
import { SystemHealthCheck } from "@/components/configuracion/SystemHealthCheck";
import { ExchangeRatesManager } from "@/components/configuracion/ExchangeRatesManager";

export default function Configuracion() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'enterprise-accounts';

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          Administra los catálogos y configuraciones del sistema
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="enterprise-accounts">Cuentas Contables</TabsTrigger>
          <TabsTrigger value="financial-statements">Estados Financieros</TabsTrigger>
          <TabsTrigger value="tax-forms">Formularios de Impuestos</TabsTrigger>
          <TabsTrigger value="operation-types">Tipos de Operaciones</TabsTrigger>
          <TabsTrigger value="fel-documents">Documentos FEL</TabsTrigger>
          <TabsTrigger value="journal-prefixes">Prefijos de Partidas</TabsTrigger>
          <TabsTrigger value="alerts">Alertas</TabsTrigger>
          <TabsTrigger value="due-dates">Fechas Vencimiento</TabsTrigger>
          <TabsTrigger value="exchange-rates">Tipos de Cambio</TabsTrigger>
          <TabsTrigger value="pdf-typography">Tipografía PDFs</TabsTrigger>
          <TabsTrigger value="permissions">Roles y Permisos</TabsTrigger>
          <TabsTrigger value="backup">Respaldo</TabsTrigger>
          <TabsTrigger value="integrity">Integridad</TabsTrigger>
          <TabsTrigger value="health">Estado del Sistema</TabsTrigger>
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

        <TabsContent value="alerts" className="mt-6">
          <AlertConfigManager />
        </TabsContent>

        <TabsContent value="due-dates" className="mt-6 space-y-6">
          <TaxDueDateConfig />
          <HolidaysManager />
        </TabsContent>

        <TabsContent value="exchange-rates" className="mt-6">
          <ExchangeRatesManager />
        </TabsContent>

        <TabsContent value="pdf-typography" className="mt-6">
          <PdfTypographyManager />
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <PermissionsMatrix />
        </TabsContent>

        <TabsContent value="backup" className="mt-6">
          <BackupRestoreManager />
        </TabsContent>

        <TabsContent value="integrity" className="mt-6">
          <IntegrityValidationPanel />
        </TabsContent>

        <TabsContent value="health" className="mt-6">
          <SystemHealthCheck />
        </TabsContent>
      </Tabs>
    </div>
  );
}

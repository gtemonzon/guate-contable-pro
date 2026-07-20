import { useMemo, useState, useEffect } from "react";
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
import { IsrCategoriesManager } from "@/components/configuracion/IsrCategoriesManager";
import { AccountingControlsConfig } from "@/components/configuracion/AccountingControlsConfig";
import { CollectionTermsManager } from "@/components/configuracion/CollectionTermsManager";
import { CollectionReasonsManager } from "@/components/configuracion/CollectionReasonsManager";
import { CollectionSettingsManager } from "@/components/configuracion/CollectionSettingsManager";
import { useTenant } from "@/contexts/TenantContext";
import { Calculator, HandCoins, Receipt, ShieldCheck, Settings as SettingsIcon } from "lucide-react";

type SubTab = {
  value: string;
  label: string;
  render: () => JSX.Element;
  superAdminOnly?: boolean;
};

type Category = {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tabs: SubTab[];
};

export default function Configuracion() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isSuperAdmin } = useTenant();

  const categories: Category[] = useMemo(
    () => [
      {
        value: "accounting",
        label: "Contabilidad",
        icon: Calculator,
        tabs: [
          { value: "enterprise-accounts", label: "Cuentas Contables", render: () => <EnterpriseAccountsManager /> },
          { value: "financial-statements", label: "Estados Financieros", render: () => <FinancialStatementDesigner /> },
          {
            value: "operation-types",
            label: "Tipos de Operaciones",
            render: () => (
              <Card>
                <CardHeader>
                  <CardTitle>Tipos de Operaciones</CardTitle>
                  <CardDescription>Gestiona los tipos de operaciones para compras y ventas</CardDescription>
                </CardHeader>
                <CardContent>
                  <OperationTypesManager />
                </CardContent>
              </Card>
            ),
          },
          {
            value: "journal-prefixes",
            label: "Prefijos de Partidas",
            render: () => (
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
            ),
          },
          { value: "accounting-controls", label: "Controles Contables", render: () => <AccountingControlsConfig /> },
          { value: "alerts", label: "Alertas", render: () => <AlertConfigManager /> },
        ],
      },
      {
        value: "tax",
        label: "Tributario",
        icon: Receipt,
        tabs: [
          { value: "tax-forms", label: "Formularios de Impuestos", render: () => <EnterpriseTaxConfigManager /> },
          {
            value: "fel-documents",
            label: "Documentos FEL",
            render: () => (
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
            ),
          },
          {
            value: "due-dates",
            label: "Fechas de Vencimiento",
            render: () => (
              <div className="space-y-6">
                <TaxDueDateConfig />
                <HolidaysManager />
              </div>
            ),
          },
          { value: "isr-categories", label: "Categorías ISR (Global)", render: () => <IsrCategoriesManager />, superAdminOnly: true },
        ],
      },
      {
        value: "security",
        label: "Seguridad",
        icon: ShieldCheck,
        tabs: [
          { value: "permissions", label: "Roles y Permisos", render: () => <PermissionsMatrix /> },
        ],
      },
      {
        value: "system",
        label: "Sistema",
        icon: SettingsIcon,
        tabs: [
          { value: "exchange-rates", label: "Tipos de Cambio", render: () => <ExchangeRatesManager /> },
          { value: "pdf-typography", label: "Tipografía PDFs", render: () => <PdfTypographyManager /> },
          { value: "backup", label: "Respaldo", render: () => <BackupRestoreManager /> },
          { value: "integrity", label: "Integridad", render: () => <IntegrityValidationPanel /> },
          { value: "health", label: "Estado del Sistema", render: () => <SystemHealthCheck /> },
        ],
      },
    ],
    []
  );

  // Filter tabs by role
  const visibleCategories = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, tabs: c.tabs.filter((t) => !t.superAdminOnly || isSuperAdmin) }))
        .filter((c) => c.tabs.length > 0),
    [categories, isSuperAdmin]
  );

  // Determine initial category & sub-tab from query param (?tab=<subtab-value>)
  const requestedTab = searchParams.get("tab");
  const initialCategory = useMemo(() => {
    if (requestedTab) {
      const found = visibleCategories.find((c) => c.tabs.some((t) => t.value === requestedTab));
      if (found) return found.value;
    }
    return visibleCategories[0]?.value ?? "accounting";
  }, [requestedTab, visibleCategories]);

  const [category, setCategory] = useState(initialCategory);
  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  const currentCategory = visibleCategories.find((c) => c.value === category) ?? visibleCategories[0];
  const initialSubTab =
    (requestedTab && currentCategory?.tabs.find((t) => t.value === requestedTab)?.value) ||
    currentCategory?.tabs[0]?.value ||
    "";

  const [subTab, setSubTab] = useState(initialSubTab);
  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleSubTabChange = (value: string) => {
    setSubTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next, { replace: true });
  };

  if (!currentCategory) return null;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Configuración</h1>
        <p className="text-muted-foreground">
          Administra los catálogos y el comportamiento del ERP organizado por categorías
        </p>
      </div>

      {/* Level 1: Categories */}
      <Tabs value={category} onValueChange={setCategory} className="w-full">
        <TabsList className="flex-wrap h-auto">
          {visibleCategories.map((c) => {
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
              {t.render()}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

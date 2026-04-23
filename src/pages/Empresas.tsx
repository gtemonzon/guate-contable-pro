import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Building2, LayoutGrid, TableIcon } from "lucide-react";
import { EnterpriseDialog } from "@/components/empresas/EnterpriseDialog";
import { EnterpriseCard } from "@/components/empresas/EnterpriseCard";
import { EnterprisesTable } from "@/components/empresas/EnterprisesTable";
import { EnterpriseSetupWizard } from "@/components/empresas/EnterpriseSetupWizard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Database } from "@/integrations/supabase/types";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useTenant } from "@/contexts/TenantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Enterprise = Database['public']['Tables']['tab_enterprises']['Row'];

type ViewMode = "cards" | "table";

const Empresas = () => {
  const { toast } = useToast();
  const { currentTenant, isSuperAdmin, allTenants, switchTenant } = useTenant();
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardEnterprise, setWizardEnterprise] = useState<Enterprise | null>(null);
  const [dialogDefaultTab, setDialogDefaultTab] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    return (localStorage.getItem("empresasViewMode") as ViewMode) || "cards";
  });

  const [tenantFilter, setTenantFilter] = useState<string>("current");

  const fetchEnterprises = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('tab_enterprises')
        .select('*')
        .order('created_at', { ascending: false });

      if (isSuperAdmin) {
        if (tenantFilter !== "all") {
          const tenantId = tenantFilter === "current" ? currentTenant?.id : parseInt(tenantFilter);
          if (tenantId) query = query.eq('tenant_id', tenantId);
        }
      } else if (currentTenant?.id) {
        query = query.eq('tenant_id', currentTenant.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEnterprises(data || []);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al cargar empresas",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnterprises();
  }, [currentTenant?.id, tenantFilter, isSuperAdmin]);

  useEffect(() => {
    localStorage.setItem("empresasViewMode", viewMode);
  }, [viewMode]);

  const handleEdit = (enterprise: Enterprise) => {
    setSelectedEnterprise(enterprise);
    setDialogDefaultTab(undefined);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setSelectedEnterprise(null);
    setDialogDefaultTab(undefined);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedEnterprise(null);
    setDialogDefaultTab(undefined);
    fetchEnterprises();
  };

  const handleOpenWizard = (enterprise: Enterprise) => {
    setWizardEnterprise(enterprise);
    setWizardOpen(true);
  };

  const handleWizardOpenDialog = (tab: string) => {
    if (wizardEnterprise) {
      setSelectedEnterprise(wizardEnterprise);
      setDialogDefaultTab(tab);
      setDialogOpen(true);
    }
  };

  useEffect(() => {
    const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
    if (!currentEnterpriseId && enterprises.length > 0) {
      const firstEnterprise = enterprises[0];
      localStorage.setItem("currentEnterpriseId", firstEnterprise.id.toString());
      toast({
        title: "Empresa seleccionada automáticamente",
        description: `${firstEnterprise.business_name} está ahora activa`,
      });
    }
  }, [enterprises, toast]);

  const filteredEnterprises = enterprises.filter((enterprise) =>
    enterprise.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    enterprise.nit.includes(searchQuery) ||
    (enterprise.trade_name && enterprise.trade_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Empresas</h1>
          <p className="text-muted-foreground">
            Gestiona las empresas registradas en el sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin && allTenants.length > 0 && (
            <Select value={tenantFilter} onValueChange={setTenantFilter}>
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Filtrar por tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tenants</SelectItem>
                {currentTenant && (
                  <SelectItem value="current">Tenant actual: {currentTenant.tenant_name}</SelectItem>
                )}
                {allTenants.map((t) => (
                  <SelectItem key={t.id} value={t.id.toString()}>{t.tenant_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Empresa
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Buscar Empresas</CardTitle>
              <CardDescription>
                Filtra por nombre, razón social o NIT
              </CardDescription>
            </div>
            <ToggleGroup 
              type="single" 
              value={viewMode} 
              onValueChange={(value) => value && setViewMode(value as ViewMode)}
            >
              <ToggleGroupItem value="cards" aria-label="Vista de tarjetas">
                <LayoutGrid className="h-4 w-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="table" aria-label="Vista de tabla">
                <TableIcon className="h-4 w-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {filteredEnterprises.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No hay empresas registradas</p>
            <p className="text-sm text-muted-foreground mb-4">
              Comienza creando tu primera empresa
            </p>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Crear Primera Empresa
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEnterprises.map((enterprise) => (
            <EnterpriseCard
              key={enterprise.id}
              enterprise={enterprise}
              onEdit={handleEdit}
              onDelete={fetchEnterprises}
              onOpenWizard={handleOpenWizard}
            />
          ))}
        </div>
      ) : (
        <EnterprisesTable
          enterprises={filteredEnterprises}
          onEdit={handleEdit}
          onDelete={fetchEnterprises}
          onOpenWizard={handleOpenWizard}
        />
      )}

      <EnterpriseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        enterprise={selectedEnterprise}
        onSuccess={handleDialogClose}
        defaultTenantId={currentTenant?.id}
        defaultTab={dialogDefaultTab}
      />

      <EnterpriseSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        enterprise={wizardEnterprise}
        onOpenEnterpriseDialog={handleWizardOpenDialog}
      />
    </div>
  );
};

export default Empresas;

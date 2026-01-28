import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Search, Building2, Plus, Users, Briefcase, Settings } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { TenantDialog } from "@/components/tenants/TenantDialog";
import { Badge } from "@/components/ui/badge";

interface Tenant {
  id: number;
  tenant_code: string;
  tenant_name: string;
  subdomain: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  max_enterprises: number;
  max_users: number;
  plan_type: string;
  created_at: string;
  enterprise_count?: number;
  user_count?: number;
}

const Tenants = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const { isSuperAdmin } = useTenant();

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
    } else {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      
      // Fetch tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from("tab_tenants")
        .select("*")
        .order("created_at", { ascending: false });

      if (tenantsError) throw tenantsError;

      // Fetch counts for each tenant
      const tenantsWithCounts = await Promise.all(
        (tenantsData || []).map(async (tenant) => {
          const [enterpriseResult, userResult] = await Promise.all([
            supabase
              .from("tab_enterprises")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenant.id),
            supabase
              .from("tab_users")
              .select("id", { count: "exact", head: true })
              .eq("tenant_id", tenant.id),
          ]);

          return {
            ...tenant,
            enterprise_count: enterpriseResult.count || 0,
            user_count: userResult.count || 0,
          };
        })
      );

      setTenants(tenantsWithCounts);
    } catch (error: any) {
      toast.error("Error al cargar tenants", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedTenant(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedTenant(null);
    fetchTenants();
  };

  const filteredTenants = tenants.filter((tenant) => {
    const query = searchQuery.toLowerCase();
    return (
      tenant.tenant_name.toLowerCase().includes(query) ||
      tenant.tenant_code.toLowerCase().includes(query) ||
      (tenant.contact_email?.toLowerCase().includes(query) || false)
    );
  });

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case "enterprise":
        return "default";
      case "professional":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              No tienes permisos para acceder a esta sección.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Gestión de Tenants
          </h1>
          <p className="text-muted-foreground">
            Administra las oficinas contables y sus límites
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Tenant
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar Tenants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, código o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {filteredTenants.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No se encontraron tenants
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTenants.map((tenant) => (
            <Card
              key={tenant.id}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleEdit(tenant)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {tenant.logo_url ? (
                      <img
                        src={tenant.logo_url}
                        alt={tenant.tenant_name}
                        className="h-10 w-10 rounded-lg object-contain"
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{ backgroundColor: tenant.primary_color }}
                      >
                        <Building2 className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-lg">
                        {tenant.tenant_name}
                      </CardTitle>
                      <CardDescription>{tenant.tenant_code}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={getPlanBadgeVariant(tenant.plan_type)}>
                    {tenant.plan_type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Briefcase className="h-4 w-4" />
                      <span>Empresas</span>
                    </div>
                    <span className="font-medium">
                      {tenant.enterprise_count} / {tenant.max_enterprises}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>Usuarios</span>
                    </div>
                    <span className="font-medium">
                      {tenant.user_count} / {tenant.max_users}
                    </span>
                  </div>
                  {tenant.contact_email && (
                    <p className="text-sm text-muted-foreground truncate">
                      {tenant.contact_email}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        tenant.is_active ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {tenant.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TenantDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        tenant={selectedTenant}
        onClose={handleDialogClose}
      />
    </div>
  );
};

export default Tenants;

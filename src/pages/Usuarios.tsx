import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Search, UserPlus } from "lucide-react";
import UserCard from "@/components/usuarios/UserCard";
import UserDialog from "@/components/usuarios/UserDialog";
import { useTenant } from "@/contexts/TenantContext";

interface User {
  id: string;
  email: string;
  full_name: string;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
  last_activity_at: string | null;
  current_enterprise_name: string | null;
  tenant_id: number;
  enterprises?: Array<{
    enterprise_id: number;
    role: string;
    enterprise: {
      id: number;
      business_name: string;
    };
  }>;
}

const Usuarios = () => {
  const { currentTenant, isSuperAdmin, isTenantAdmin, allTenants } = useTenant();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tenantFilter, setTenantFilter] = useState<string>("current");

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  // Refetch users when tenant or filter changes
  useEffect(() => {
    if (currentTenant?.id || isSuperAdmin) {
      fetchUsers();
    }
  }, [currentTenant?.id, tenantFilter, isSuperAdmin]);

  // Suscripción a cambios en tiempo real para actualizar semáforos
  useEffect(() => {
    const channel = supabase
      .channel('users-activity')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tab_users',
        },
        (payload) => {
          setUsers(prevUsers =>
            prevUsers.map(user =>
              user.id === payload.new.id
                ? { ...user, last_activity_at: payload.new.last_activity_at, current_enterprise_name: payload.new.current_enterprise_name }
                : user
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from("tab_users")
          .select("*")
          .eq("id", user.id)
          .single();

        if (error) throw error;
        setCurrentUser(data);
      }
    } catch (error: unknown) {
      console.error("Error fetching current user:", error);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("tab_users")
        .select(`
          *,
          enterprises:tab_user_enterprises(
            enterprise_id,
            role,
            enterprise:tab_enterprises(
              id,
              business_name
            )
          )
        `)
        .eq("is_system_user", false)
        .order("created_at", { ascending: false });

      // Filter by tenant
      if (isSuperAdmin) {
        if (tenantFilter !== "all") {
          const tenantId = tenantFilter === "current" ? currentTenant?.id : parseInt(tenantFilter);
          if (tenantId) query = query.eq("tenant_id", tenantId);
        }
      } else if (currentTenant?.id) {
        query = query.eq("tenant_id", currentTenant.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setUsers(data || []);
    } catch (error: unknown) {
      toast.error("Error al cargar usuarios", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedUser(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setSelectedUser(null);
    fetchUsers();
  };

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(query) ||
      user.full_name.toLowerCase().includes(query)
    );
  });

  const isAdmin = currentUser?.is_super_admin || isTenantAdmin;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">No tienes permisos para acceder a esta sección.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Gestión de Usuarios</h1>
          <p className="text-muted-foreground">
            Administra usuarios y asigna empresas
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
            <UserPlus className="mr-2 h-4 w-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por email o nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No se encontraron usuarios
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      <UserDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        user={selectedUser}
        onClose={handleDialogClose}
      />
    </div>
  );
};

export default Usuarios;

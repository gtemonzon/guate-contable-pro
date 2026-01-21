import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Building2, Shield } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleSelector, RoleBadge } from "./RoleSelector";
import { ScrollArea } from "@/components/ui/scroll-area";

const userFormSchema = z.object({
  email: z.string().email("Email inválido"),
  full_name: z.string().min(3, "El nombre debe tener al menos 3 caracteres"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres").optional().or(z.literal("")),
  is_active: z.boolean(),
  is_tenant_admin: z.boolean(),
  selected_tenant_id: z.number().nullable(),
});

type UserFormData = z.infer<typeof userFormSchema>;

interface Enterprise {
  id: number;
  business_name: string;
}

interface Tenant {
  id: number;
  tenant_code: string;
  tenant_name: string;
}

interface EnterpriseRole {
  enterprise_id: number;
  role: string;
}

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any | null;
  onClose: () => void;
}

const UserDialog = ({ open, onOpenChange, user, onClose }: UserDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [enterprises, setEnterprises] = useState<Enterprise[]>([]);
  const [enterpriseRoles, setEnterpriseRoles] = useState<EnterpriseRole[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentUserIsSuperAdmin, setCurrentUserIsSuperAdmin] = useState(false);
  const [currentUserTenantId, setCurrentUserTenantId] = useState<number | null>(null);
  const isEditing = !!user;

  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      full_name: "",
      password: "",
      is_active: true,
      is_tenant_admin: false,
      selected_tenant_id: null,
    },
  });

  const isTenantAdmin = form.watch("is_tenant_admin");

  useEffect(() => {
    if (open) {
      fetchCurrentUserInfo();
      fetchEnterprises();
      if (user) {
        form.reset({
          email: user.email,
          full_name: user.full_name,
          password: "",
          is_active: user.is_active,
          is_tenant_admin: user.is_tenant_admin || false,
          selected_tenant_id: user.tenant_id || null,
        });
        fetchUserRoles(user.id);
      } else {
        form.reset({
          email: "",
          full_name: "",
          password: "",
          is_active: true,
          is_tenant_admin: false,
          selected_tenant_id: null,
        });
        setEnterpriseRoles([]);
      }
    }
  }, [open, user]);

  // Fetch tenants when tenant admin toggle is activated
  useEffect(() => {
    if (isTenantAdmin && currentUserIsSuperAdmin && tenants.length === 0) {
      fetchTenants();
    }
  }, [isTenantAdmin, currentUserIsSuperAdmin]);

  const fetchCurrentUserInfo = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        const { data, error } = await supabase
          .from("tab_users")
          .select("is_super_admin, tenant_id")
          .eq("id", authUser.id)
          .single();

        if (!error && data) {
          setCurrentUserIsSuperAdmin(data.is_super_admin || false);
          setCurrentUserTenantId(data.tenant_id);
          
          // If not super admin, set the default tenant_id to current user's tenant
          if (!data.is_super_admin && !user) {
            form.setValue("selected_tenant_id", data.tenant_id);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching current user info:", error);
    }
  };

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_tenants")
        .select("id, tenant_code, tenant_name")
        .eq("is_active", true)
        .order("tenant_name");

      if (error) throw error;
      setTenants(data || []);
    } catch (error: any) {
      console.error("Error fetching tenants:", error);
    }
  };

  const fetchEnterprises = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_enterprises")
        .select("id, business_name")
        .eq("is_active", true)
        .order("business_name");

      if (error) throw error;
      setEnterprises(data || []);
    } catch (error: any) {
      toast.error("Error al cargar empresas", {
        description: error.message,
      });
    }
  };

  const fetchUserRoles = async (userId: string) => {
    try {
      // Obtener roles de user_roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("enterprise_id, role")
        .eq("user_id", userId);

      if (rolesError) throw rolesError;

      // Si no hay roles en user_roles, obtener de tab_user_enterprises para migrar
      if (!rolesData || rolesData.length === 0) {
        const { data: enterprisesData, error: entError } = await supabase
          .from("tab_user_enterprises")
          .select("enterprise_id, role")
          .eq("user_id", userId);

        if (entError) throw entError;

        // Mapear roles antiguos a nuevos
        const mappedRoles = (enterprisesData || []).map(e => ({
          enterprise_id: e.enterprise_id!,
          role: mapOldRoleToNew(e.role),
        }));

        setEnterpriseRoles(mappedRoles);
      } else {
        setEnterpriseRoles(
          rolesData.map(r => ({
            enterprise_id: r.enterprise_id!,
            role: r.role as string,
          }))
        );
      }
    } catch (error: any) {
      console.error("Error fetching user roles:", error);
      setEnterpriseRoles([]);
    }
  };

  // Mapear roles antiguos a los nuevos
  const mapOldRoleToNew = (oldRole: string): string => {
    const roleMap: Record<string, string> = {
      'admin_empresa': 'enterprise_admin',
      'usuario_basico': 'auxiliar_contable',
      'contador': 'contador_senior',
      'viewer': 'cliente',
    };
    return roleMap[oldRole] || 'auxiliar_contable';
  };

  const updateEnterpriseRole = (enterpriseId: number, role: string) => {
    setEnterpriseRoles(prev => {
      const existing = prev.find(r => r.enterprise_id === enterpriseId);
      if (existing) {
        if (role === '') {
          // Remover rol
          return prev.filter(r => r.enterprise_id !== enterpriseId);
        }
        return prev.map(r => 
          r.enterprise_id === enterpriseId ? { ...r, role } : r
        );
      } else if (role !== '') {
        return [...prev, { enterprise_id: enterpriseId, role }];
      }
      return prev;
    });
  };

  const getEnterpriseRole = (enterpriseId: number): string => {
    return enterpriseRoles.find(r => r.enterprise_id === enterpriseId)?.role || '';
  };

  const onSubmit = async (data: UserFormData) => {
    console.log("Formulario enviado:", data, "Roles por empresa:", enterpriseRoles);
    
    // Validate tenant selection for tenant admins
    if (data.is_tenant_admin && !data.selected_tenant_id && currentUserIsSuperAdmin) {
      toast.error("Debe seleccionar un tenant para el administrador");
      return;
    }

    // For non-super admins creating tenant admins, use their own tenant
    const finalTenantId = data.selected_tenant_id || currentUserTenantId;

    try {
      setLoading(true);

      if (isEditing) {
        // Get current user to check permissions
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) throw new Error("Usuario no autenticado");

        // Update existing user
        const { error: userError } = await supabase
          .from("tab_users")
          .update({
            full_name: data.full_name,
            is_active: data.is_active,
            is_tenant_admin: data.is_tenant_admin,
            tenant_id: finalTenantId,
          })
          .eq("id", user.id);

        if (userError) throw userError;

        // Update tab_user_enterprises (for backward compatibility)
        const { error: deleteEntError } = await supabase
          .from("tab_user_enterprises")
          .delete()
          .eq("user_id", user.id);

        if (deleteEntError) throw deleteEntError;

        if (enterpriseRoles.length > 0) {
          const enterpriseRelations = enterpriseRoles.map((er) => ({
            user_id: user.id,
            enterprise_id: er.enterprise_id,
            role: er.role,
          }));

          const { error: entError } = await supabase
            .from("tab_user_enterprises")
            .insert(enterpriseRelations);

          if (entError) throw entError;
        }

        // Update user_roles table
        const { error: deleteRolesError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", user.id);

        if (deleteRolesError) {
          console.error("Error deleting old roles:", deleteRolesError);
        }

        if (enterpriseRoles.length > 0) {
          const roleRecords = enterpriseRoles.map((er) => ({
            user_id: user.id,
            enterprise_id: er.enterprise_id,
            role: er.role as Database['public']['Enums']['app_role'],
          }));

          const { error: rolesError } = await supabase
            .from("user_roles")
            .insert(roleRecords);

          if (rolesError) {
            console.error("Error inserting roles:", rolesError);
          }
        }

        toast.success("Usuario actualizado correctamente");
      } else {
        // Create new user via auth
        if (!data.password) {
          toast.error("La contraseña es requerida para nuevos usuarios");
          return;
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: data.password,
          options: {
            data: {
              full_name: data.full_name,
            },
          },
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error("No se pudo crear el usuario");

        // The trigger will create the user in tab_users
        // Wait a bit for the trigger to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Update user info including tenant admin status
        const { error: userError } = await supabase
          .from("tab_users")
          .update({
            is_active: data.is_active,
            is_tenant_admin: data.is_tenant_admin,
            tenant_id: finalTenantId,
          })
          .eq("id", authData.user.id);

        if (userError) throw userError;

        // Add enterprise assignments
        if (enterpriseRoles.length > 0) {
          const enterpriseRelations = enterpriseRoles.map((er) => ({
            user_id: authData.user.id,
            enterprise_id: er.enterprise_id,
            role: er.role,
          }));

          const { error: entError } = await supabase
            .from("tab_user_enterprises")
            .insert(enterpriseRelations);

          if (entError) throw entError;

          // Also insert into user_roles
          const roleRecords = enterpriseRoles.map((er) => ({
            user_id: authData.user.id,
            enterprise_id: er.enterprise_id,
            role: er.role as Database['public']['Enums']['app_role'],
          }));

          const { error: rolesError } = await supabase
            .from("user_roles")
            .insert(roleRecords);

          if (rolesError) {
            console.error("Error inserting roles:", rolesError);
          }
        }

        toast.success("Usuario creado correctamente");
      }

      onClose();
    } catch (error: any) {
      console.error("Error al guardar usuario:", error);
      toast.error("Error al guardar usuario", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Usuario" : "Crear Nuevo Usuario"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Actualiza la información del usuario y sus roles por empresa"
              : "Crea un nuevo usuario y asigna los roles correspondientes"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">Información General</TabsTrigger>
                <TabsTrigger value="empresas">Empresas y Roles</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          disabled={isEditing}
                          placeholder="usuario@ejemplo.com"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="full_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Juan Pérez" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isEditing && (
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="is_tenant_admin"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Administrador de Oficina
                        </FormLabel>
                        <FormDescription>
                          Acceso total a todas las empresas y usuarios dentro de su oficina contable
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Tenant selector - only visible for super admins when tenant admin is enabled */}
                {isTenantAdmin && currentUserIsSuperAdmin && (
                  <FormField
                    control={form.control}
                    name="selected_tenant_id"
                    render={({ field }) => (
                      <FormItem className="rounded-lg border p-4 bg-muted/30">
                        <FormLabel className="flex items-center gap-2">
                          <Building2 className="h-4 w-4" />
                          Oficina Contable (Tenant)
                        </FormLabel>
                        <FormDescription className="mb-2">
                          Selecciona la oficina contable que administrará este usuario
                        </FormDescription>
                        <Select
                          value={field.value?.toString() || ""}
                          onValueChange={(value) => field.onChange(value ? Number(value) : null)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar oficina contable..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tenants.map((tenant) => (
                              <SelectItem key={tenant.id} value={tenant.id.toString()}>
                                <div className="flex items-center gap-2">
                                  <Building2 className="h-4 w-4 text-muted-foreground" />
                                  <span>{tenant.tenant_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    ({tenant.tenant_code})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Info message for non-super admins creating tenant admins */}
                {isTenantAdmin && !currentUserIsSuperAdmin && (
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Este administrador tendrá acceso a tu oficina contable actual
                    </p>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Usuario Activo</FormLabel>
                        <FormDescription>
                          Los usuarios inactivos no pueden acceder al sistema
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </TabsContent>

              <TabsContent value="empresas" className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Asigna un rol específico para cada empresa. El rol determina los permisos del usuario en esa empresa.
                  </p>
                  
                  {enterprises.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No hay empresas disponibles
                    </p>
                  ) : (
                    <ScrollArea className="h-[400px] pr-4">
                      <div className="space-y-3">
                        {enterprises.map((enterprise) => (
                          <div
                            key={enterprise.id}
                            className="flex items-center gap-4 rounded-lg border p-4"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {enterprise.business_name}
                              </p>
                              <div className="mt-1">
                                {getEnterpriseRole(enterprise.id) ? (
                                  <RoleBadge role={getEnterpriseRole(enterprise.id)} />
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sin acceso</span>
                                )}
                              </div>
                            </div>
                            <div className="w-[200px]">
                              <RoleSelector
                                value={getEnterpriseRole(enterprise.id)}
                                onChange={(role) => updateEnterpriseRole(enterprise.id, role)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default UserDialog;

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RolePermission {
  role_name: string;
  permission_key: string;
  is_enabled: boolean;
}

export interface PermissionDefinition {
  key: string;
  name: string;
  category: string;
  description?: string;
}

// Definición de todos los permisos disponibles
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // Administración
  { key: "manage_users", name: "Gestionar Usuarios", category: "Administración", description: "Crear, editar y eliminar usuarios" },
  { key: "manage_enterprises", name: "Gestionar Empresas", category: "Administración", description: "Crear y configurar empresas" },
  { key: "access_configuration", name: "Configuración del Sistema", category: "Administración", description: "Acceso a configuraciones avanzadas" },
  
  // Catálogo de Cuentas
  { key: "view_accounts", name: "Ver Catálogo de Cuentas", category: "Catálogo de Cuentas", description: "Visualizar el plan de cuentas" },
  { key: "edit_accounts", name: "Editar Catálogo de Cuentas", category: "Catálogo de Cuentas", description: "Modificar cuentas contables" },
  
  // Partidas Contables
  { key: "create_entries", name: "Crear Partidas", category: "Partidas Contables", description: "Crear nuevas partidas contables" },
  { key: "approve_entries", name: "Aprobar Partidas", category: "Partidas Contables", description: "Aprobar partidas pendientes" },
  { key: "post_entries", name: "Contabilizar Partidas", category: "Partidas Contables", description: "Mayorizan y contabilizar partidas" },
  { key: "void_entries", name: "Anular Partidas", category: "Partidas Contables", description: "Generar reversiones contables de partidas" },
  
  // Compras y Ventas
  { key: "import_data", name: "Importar Datos", category: "Compras y Ventas", description: "Importar compras, ventas y otros datos" },
  
  // Operaciones
  { key: "bank_reconciliation", name: "Conciliación Bancaria", category: "Operaciones", description: "Realizar conciliaciones bancarias" },
  { key: "manage_tax_forms", name: "Formularios de Impuestos", category: "Operaciones", description: "Gestionar formularios fiscales" },
  { key: "generate_declarations", name: "Generar Declaraciones", category: "Operaciones", description: "Generar declaraciones de impuestos" },
  
  // Reportes
  { key: "view_reports", name: "Ver Reportes", category: "Reportes", description: "Visualizar reportes contables" },
  { key: "export_reports", name: "Exportar Reportes", category: "Reportes", description: "Exportar reportes a PDF/Excel" },
];

export const AVAILABLE_ROLES_CONFIG = [
  { value: 'enterprise_admin', label: 'Administrador de Empresa', color: 'bg-primary' },
  { value: 'contador_senior', label: 'Contador Senior', color: 'bg-blue-500' },
  { value: 'auxiliar_contable', label: 'Auxiliar Contable', color: 'bg-amber-500' },
  { value: 'cliente', label: 'Cliente', color: 'bg-slate-500' },
];

export function useRolePermissions(enterpriseId: number | null) {
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchPermissions = useCallback(async () => {
    if (!enterpriseId) {
      setPermissions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from("tab_role_permissions")
        .select("role_name, permission_key, is_enabled")
        .eq("enterprise_id", enterpriseId);

      if (error) throw error;

      // Si no hay permisos configurados, inicializarlos
      if (!data || data.length === 0) {
        await initializePermissions(enterpriseId);
        // Volver a cargar después de inicializar
        const { data: newData, error: newError } = await supabase
          .from("tab_role_permissions")
          .select("role_name, permission_key, is_enabled")
          .eq("enterprise_id", enterpriseId);
        
        if (newError) throw newError;
        setPermissions(newData || []);
      } else {
        setPermissions(data);
      }
    } catch (error) {
      console.error("Error fetching permissions:", error);
      toast.error("Error al cargar permisos");
    } finally {
      setIsLoading(false);
    }
  }, [enterpriseId]);

  const initializePermissions = async (entId: number) => {
    try {
      const { error } = await supabase.rpc("initialize_default_permissions", {
        p_enterprise_id: entId
      });
      if (error) throw error;
    } catch (error) {
      console.error("Error initializing permissions:", error);
    }
  };

  const updatePermission = async (
    roleName: string, 
    permissionKey: string, 
    isEnabled: boolean
  ) => {
    if (!enterpriseId) return;

    try {
      setIsSaving(true);

      const { error } = await supabase
        .from("tab_role_permissions")
        .upsert({
          enterprise_id: enterpriseId,
          role_name: roleName,
          permission_key: permissionKey,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString()
        }, {
          onConflict: "enterprise_id,role_name,permission_key"
        });

      if (error) throw error;

      // Actualizar estado local
      setPermissions(prev => {
        const existing = prev.find(
          p => p.role_name === roleName && p.permission_key === permissionKey
        );
        
        if (existing) {
          return prev.map(p => 
            p.role_name === roleName && p.permission_key === permissionKey
              ? { ...p, is_enabled: isEnabled }
              : p
          );
        } else {
          return [...prev, { role_name: roleName, permission_key: permissionKey, is_enabled: isEnabled }];
        }
      });

      toast.success("Permiso actualizado");
    } catch (error) {
      console.error("Error updating permission:", error);
      toast.error("Error al actualizar permiso");
    } finally {
      setIsSaving(false);
    }
  };

  const getPermissionValue = (roleName: string, permissionKey: string): boolean => {
    const perm = permissions.find(
      p => p.role_name === roleName && p.permission_key === permissionKey
    );
    return perm?.is_enabled ?? false;
  };

  const resetToDefaults = async () => {
    if (!enterpriseId) return;

    try {
      setIsSaving(true);

      // Eliminar permisos existentes
      const { error: deleteError } = await supabase
        .from("tab_role_permissions")
        .delete()
        .eq("enterprise_id", enterpriseId);

      if (deleteError) throw deleteError;

      // Reinicializar con valores por defecto
      await initializePermissions(enterpriseId);
      await fetchPermissions();

      toast.success("Permisos restaurados a valores por defecto");
    } catch (error) {
      console.error("Error resetting permissions:", error);
      toast.error("Error al restaurar permisos");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  return {
    permissions,
    isLoading,
    isSaving,
    updatePermission,
    getPermissionValue,
    resetToDefaults,
    refetch: fetchPermissions
  };
}

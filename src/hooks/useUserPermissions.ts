import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RolePermissionRow {
  permission_key: string;
  is_enabled: boolean;
}

export type UserRole = 'super_admin' | 'enterprise_admin' | 'contador_senior' | 'auxiliar_contable' | 'cliente' | null;

export interface UserPermissions {
  role: UserRole;
  roleDisplayName: string;
  // Permisos de administración
  canManageUsers: boolean;
  canManageEnterprises: boolean;
  canAccessConfiguration: boolean;
  // Permisos de contabilidad
  canViewAccounts: boolean;
  canEditAccounts: boolean;
  canCreateEntries: boolean;
  canApproveEntries: boolean;
  canPostEntries: boolean;
  canImportData: boolean;
  canGenerateDeclarations: boolean;
  canBankReconciliation: boolean;
  canManageTaxForms: boolean;
  // Permisos de consulta
  canViewReports: boolean;
  canExportReports: boolean;
  // Estados
  isLoading: boolean;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  super_admin: 'Administrador',
  enterprise_admin: 'Administrador de Empresa',
  contador_senior: 'Contador Senior',
  auxiliar_contable: 'Auxiliar Contable',
  cliente: 'Cliente',
};

// Permisos por defecto por rol (fallback cuando no hay configuración en BD)
const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, boolean>> = {
  enterprise_admin: {
    manage_users: true,
    manage_enterprises: true,
    access_configuration: true,
    view_accounts: true,
    edit_accounts: true,
    create_entries: true,
    approve_entries: true,
    post_entries: true,
    import_data: true,
    generate_declarations: true,
    bank_reconciliation: true,
    manage_tax_forms: true,
    view_reports: true,
    export_reports: true,
  },
  contador_senior: {
    manage_users: false,
    manage_enterprises: false,
    access_configuration: false,
    view_accounts: true,
    edit_accounts: true,
    create_entries: true,
    approve_entries: true,
    post_entries: true,
    import_data: true,
    generate_declarations: true,
    bank_reconciliation: true,
    manage_tax_forms: true,
    view_reports: true,
    export_reports: true,
  },
  auxiliar_contable: {
    manage_users: false,
    manage_enterprises: false,
    access_configuration: false,
    view_accounts: true,
    edit_accounts: false,
    create_entries: true,
    approve_entries: false,
    post_entries: false,
    import_data: true,
    generate_declarations: false,
    bank_reconciliation: false,
    manage_tax_forms: false,
    view_reports: true,
    export_reports: true,
  },
  cliente: {
    manage_users: false,
    manage_enterprises: false,
    access_configuration: false,
    view_accounts: true,
    edit_accounts: false,
    create_entries: false,
    approve_entries: false,
    post_entries: false,
    import_data: false,
    generate_declarations: false,
    bank_reconciliation: false,
    manage_tax_forms: false,
    view_reports: true,
    export_reports: true,
  },
};

function getDefaultPermission(role: string, permissionKey: string): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role]?.[permissionKey] ?? false;
}

const defaultPermissions: UserPermissions = {
  role: null,
  roleDisplayName: '',
  canManageUsers: false,
  canManageEnterprises: false,
  canAccessConfiguration: false,
  canViewAccounts: false,
  canEditAccounts: false,
  canCreateEntries: false,
  canApproveEntries: false,
  canPostEntries: false,
  canImportData: false,
  canGenerateDeclarations: false,
  canBankReconciliation: false,
  canManageTaxForms: false,
  canViewReports: false,
  canExportReports: false,
  isLoading: true,
  isSuperAdmin: false,
  isTenantAdmin: false,
};

export function useUserPermissions(): UserPermissions {
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);

  const fetchPermissions = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissions({ ...defaultPermissions, isLoading: false });
        return;
      }

      // Obtener información del usuario (incluyendo is_super_admin e is_tenant_admin)
      const { data: userData, error: userError } = await supabase
        .from("tab_users")
        .select("is_super_admin, is_tenant_admin")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("Error fetching user data:", userError);
      }

      const isSuperAdmin = userData?.is_super_admin || false;
      const isTenantAdmin = userData?.is_tenant_admin || false;

      // Si es super admin, tiene todos los permisos
      if (isSuperAdmin) {
        setPermissions({
          role: 'super_admin',
          roleDisplayName: ROLE_DISPLAY_NAMES.super_admin,
          canManageUsers: true,
          canManageEnterprises: true,
          canAccessConfiguration: true,
          canViewAccounts: true,
          canEditAccounts: true,
          canCreateEntries: true,
          canApproveEntries: true,
          canPostEntries: true,
          canImportData: true,
          canGenerateDeclarations: true,
          canBankReconciliation: true,
          canManageTaxForms: true,
          canViewReports: true,
          canExportReports: true,
          isLoading: false,
          isSuperAdmin: true,
          isTenantAdmin: true, // Super admin también es tenant admin
        });
        return;
      }

      // Obtener empresa actual
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      
      if (!currentEnterpriseId) {
        // Sin empresa seleccionada, usar permisos mínimos pero mantener isTenantAdmin
        setPermissions({
          ...defaultPermissions,
          isLoading: false,
          isTenantAdmin,
        });
        return;
      }

      // Obtener rol del usuario para la empresa actual
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .maybeSingle();

      if (roleError) {
        console.error("Error fetching role:", roleError);
      }

      const role = roleData?.role as UserRole || null;
      const roleDisplayName = role ? (ROLE_DISPLAY_NAMES[role] || role) : '';

      if (!role) {
        // Sin rol asignado - permisos mínimos pero mantener isTenantAdmin
        setPermissions({
          ...defaultPermissions,
          role: null,
          roleDisplayName: 'Sin rol asignado',
          canViewReports: true,
          isLoading: false,
          isTenantAdmin,
        });
        return;
      }

      // Obtener permisos configurados desde la base de datos
      const { data: permissionsData, error: permissionsError } = await supabase
        .from("tab_role_permissions")
        .select("permission_key, is_enabled")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .eq("role_name", role);

      if (permissionsError) {
        console.error("Error fetching permissions:", permissionsError);
      }

      // Convertir permisos de la BD a objeto
      const dbPermissions: Record<string, boolean> = {};
      (permissionsData as RolePermissionRow[] || []).forEach((p) => {
        dbPermissions[p.permission_key] = p.is_enabled;
      });

      // Si hay permisos configurados, usarlos; si no, usar defaults por rol
      const hasCustomPermissions = permissionsData && permissionsData.length > 0;

      const newPermissions: UserPermissions = {
        role,
        roleDisplayName,
        canManageUsers: hasCustomPermissions ? (dbPermissions['manage_users'] ?? false) : getDefaultPermission(role, 'manage_users'),
        canManageEnterprises: hasCustomPermissions ? (dbPermissions['manage_enterprises'] ?? false) : getDefaultPermission(role, 'manage_enterprises'),
        canAccessConfiguration: hasCustomPermissions ? (dbPermissions['access_configuration'] ?? false) : getDefaultPermission(role, 'access_configuration'),
        canViewAccounts: hasCustomPermissions ? (dbPermissions['view_accounts'] ?? true) : getDefaultPermission(role, 'view_accounts'),
        canEditAccounts: hasCustomPermissions ? (dbPermissions['edit_accounts'] ?? false) : getDefaultPermission(role, 'edit_accounts'),
        canCreateEntries: hasCustomPermissions ? (dbPermissions['create_entries'] ?? false) : getDefaultPermission(role, 'create_entries'),
        canApproveEntries: hasCustomPermissions ? (dbPermissions['approve_entries'] ?? false) : getDefaultPermission(role, 'approve_entries'),
        canPostEntries: hasCustomPermissions ? (dbPermissions['post_entries'] ?? false) : getDefaultPermission(role, 'post_entries'),
        canImportData: hasCustomPermissions ? (dbPermissions['import_data'] ?? false) : getDefaultPermission(role, 'import_data'),
        canGenerateDeclarations: hasCustomPermissions ? (dbPermissions['generate_declarations'] ?? false) : getDefaultPermission(role, 'generate_declarations'),
        canBankReconciliation: hasCustomPermissions ? (dbPermissions['bank_reconciliation'] ?? false) : getDefaultPermission(role, 'bank_reconciliation'),
        canManageTaxForms: hasCustomPermissions ? (dbPermissions['manage_tax_forms'] ?? false) : getDefaultPermission(role, 'manage_tax_forms'),
        canViewReports: hasCustomPermissions ? (dbPermissions['view_reports'] ?? true) : getDefaultPermission(role, 'view_reports'),
        canExportReports: hasCustomPermissions ? (dbPermissions['export_reports'] ?? true) : getDefaultPermission(role, 'export_reports'),
        isLoading: false,
        isSuperAdmin: false,
        isTenantAdmin,
      };

      setPermissions(newPermissions);
    } catch (error) {
      console.error("Error in useUserPermissions:", error);
      setPermissions({ ...defaultPermissions, isLoading: false });
    }
  }, []);

  useEffect(() => {
    fetchPermissions();

    // Escuchar cambios de empresa
    const handleEnterpriseChange = () => {
      fetchPermissions();
    };

    window.addEventListener("enterpriseChanged", handleEnterpriseChange);
    window.addEventListener("storage", handleEnterpriseChange);

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchPermissions();
    });

    return () => {
      window.removeEventListener("enterpriseChanged", handleEnterpriseChange);
      window.removeEventListener("storage", handleEnterpriseChange);
      subscription.unsubscribe();
    };
  }, [fetchPermissions]);

  return permissions;
}

// Función helper para obtener el rol display name
export function getRoleDisplayName(role: string | null): string {
  if (!role) return 'Sin rol';
  return ROLE_DISPLAY_NAMES[role] || role;
}

// Constantes de roles disponibles para asignar
export const AVAILABLE_ROLES = [
  { value: 'enterprise_admin', label: 'Administrador de Empresa', description: 'Acceso total a la empresa' },
  { value: 'contador_senior', label: 'Contador Senior', description: 'Contabilizar, aprobar y generar declaraciones' },
  { value: 'auxiliar_contable', label: 'Auxiliar Contable', description: 'Crear partidas en borrador e importar' },
  { value: 'cliente', label: 'Cliente', description: 'Solo lectura de reportes' },
] as const;

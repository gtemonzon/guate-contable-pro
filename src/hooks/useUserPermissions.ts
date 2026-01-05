import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
}

const ROLE_DISPLAY_NAMES: Record<string, string> = {
  super_admin: 'Administrador',
  enterprise_admin: 'Administrador de Empresa',
  contador_senior: 'Contador Senior',
  auxiliar_contable: 'Auxiliar Contable',
  cliente: 'Cliente',
};

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

      // Obtener información del usuario (incluyendo is_super_admin)
      const { data: userData, error: userError } = await supabase
        .from("tab_users")
        .select("is_super_admin")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("Error fetching user data:", userError);
      }

      const isSuperAdmin = userData?.is_super_admin || false;

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
        });
        return;
      }

      // Obtener empresa actual
      const currentEnterpriseId = localStorage.getItem("currentEnterpriseId");
      
      if (!currentEnterpriseId) {
        // Sin empresa seleccionada, usar permisos mínimos
        setPermissions({
          ...defaultPermissions,
          isLoading: false,
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

      // Definir permisos basados en el rol
      let newPermissions: UserPermissions;

      switch (role) {
        case 'enterprise_admin':
          newPermissions = {
            role,
            roleDisplayName,
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
            isSuperAdmin: false,
          };
          break;

        case 'contador_senior':
          newPermissions = {
            role,
            roleDisplayName,
            canManageUsers: false,
            canManageEnterprises: false,
            canAccessConfiguration: false,
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
            isSuperAdmin: false,
          };
          break;

        case 'auxiliar_contable':
          newPermissions = {
            role,
            roleDisplayName,
            canManageUsers: false,
            canManageEnterprises: false,
            canAccessConfiguration: false,
            canViewAccounts: true,
            canEditAccounts: false,
            canCreateEntries: true, // Pero sus partidas van a revisión
            canApproveEntries: false,
            canPostEntries: false,
            canImportData: true,
            canGenerateDeclarations: false,
            canBankReconciliation: false,
            canManageTaxForms: false,
            canViewReports: true,
            canExportReports: true,
            isLoading: false,
            isSuperAdmin: false,
          };
          break;

        case 'cliente':
          newPermissions = {
            role,
            roleDisplayName,
            canManageUsers: false,
            canManageEnterprises: false,
            canAccessConfiguration: false,
            canViewAccounts: true,
            canEditAccounts: false,
            canCreateEntries: false,
            canApproveEntries: false,
            canPostEntries: false,
            canImportData: false,
            canGenerateDeclarations: false,
            canBankReconciliation: false,
            canManageTaxForms: false,
            canViewReports: true,
            canExportReports: true,
            isLoading: false,
            isSuperAdmin: false,
          };
          break;

        default:
          // Sin rol asignado - permisos mínimos
          newPermissions = {
            ...defaultPermissions,
            role: null,
            roleDisplayName: 'Sin rol asignado',
            canViewReports: true,
            isLoading: false,
          };
      }

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

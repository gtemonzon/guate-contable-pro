import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { DEFAULT_TENANT_PRIMARY, hexToHsl, hslToCssTriplet, normalizeHex } from "@/utils/colorUtils";
import { supabase } from "@/integrations/supabase/client";

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
  pdf_font_family: string;
  pdf_font_size: number;
}

interface TenantContextType {
  currentTenant: Tenant | null;
  allTenants: Tenant[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
  isTenantActive: boolean;
  enabledModules: string[];
  hasModule: (moduleKey: string) => boolean;
  switchTenant: (tenantId: number) => Promise<void>;
  refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isTenantAdmin, setIsTenantAdmin] = useState(false);
  const [isTenantActive, setIsTenantActive] = useState(true);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  const fetchTenantData = async () => {
    try {
      setIsLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Get user data including tenant info
      const { data: userData, error: userError } = await supabase
        .from("tab_users")
        .select("tenant_id, is_super_admin, is_tenant_admin")
        .eq("id", user.id)
        .single();

      if (userError) {
        console.error("Error fetching user data:", userError);
        setIsLoading(false);
        return;
      }

      setIsSuperAdmin(userData.is_super_admin || false);
      setIsTenantAdmin(userData.is_tenant_admin || false);

      // If super admin, fetch all tenants
      if (userData.is_super_admin) {
        const { data: tenantsData, error: tenantsError } = await supabase
          .from("tab_tenants")
          .select("*")
          .order("tenant_name");

        if (tenantsError) {
          console.error("Error fetching all tenants:", tenantsError);
        } else {
          setAllTenants(tenantsData || []);
        }
      }

      // Fetch current tenant
      if (userData.tenant_id) {
        // Check localStorage for super admin tenant switch
        const storedTenantId = localStorage.getItem("currentTenantId");
        const tenantIdToFetch = userData.is_super_admin && storedTenantId 
          ? parseInt(storedTenantId) 
          : userData.tenant_id;

        const { data: tenantData, error: tenantError } = await supabase
          .from("tab_tenants")
          .select("*")
          .eq("id", tenantIdToFetch)
          .single();

        if (tenantError) {
          console.error("Error fetching tenant:", tenantError);
        } else {
          setCurrentTenant(tenantData);
          setIsTenantActive(tenantData?.is_active ?? false);
        }
      }
    } catch (error) {
      console.error("Error in fetchTenantData:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const switchTenant = async (tenantId: number) => {
    if (!isSuperAdmin) {
      console.warn("Only super admins can switch tenants");
      return;
    }

    localStorage.setItem("currentTenantId", tenantId.toString());
    
    // Clear enterprise selection when switching tenant
    localStorage.removeItem("currentEnterpriseId");
    
    const tenant = allTenants.find(t => t.id === tenantId);
    if (tenant) {
      setCurrentTenant(tenant);
    }

    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent("tenantChanged", { 
      detail: { tenantId } 
    }));
    window.dispatchEvent(new Event("storage"));
  };

  const refreshTenants = async () => {
    await fetchTenantData();
  };

  useEffect(() => {
    fetchTenantData();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchTenantData();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Apply tenant branding to the sidebar tokens (fallbacks in index.css apply when unset)
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => {
      root.style.removeProperty("--tenant-sidebar-bg");
      root.style.removeProperty("--tenant-sidebar-accent");
    };

    const hex = currentTenant?.primary_color ?? null;
    const normalized = hex ? normalizeHex(hex) : null;

    // Sin color personalizado (o con el color por defecto del sistema): no forzamos nada.
    if (!normalized || normalized === normalizeHex(DEFAULT_TENANT_PRIMARY)) {
      clear();
      return;
    }

    const hsl = hexToHsl(normalized);
    if (!hsl) {
      clear();
      return;
    }

    // Fondo oscuro (~22% de luminosidad) para mantener legible el texto claro,
    // y un acento algo más claro (~32%) para hover/activo.
    root.style.setProperty("--tenant-sidebar-bg", hslToCssTriplet({ ...hsl, l: 22 }));
    root.style.setProperty("--tenant-sidebar-accent", hslToCssTriplet({ ...hsl, l: 32 }));

    return clear;
  }, [currentTenant]);

  // Load enabled modules whenever the active tenant changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentTenant) {
        setEnabledModules([]);
        return;
      }
      const { data, error } = await supabase
        .from("tab_tenant_modules")
        .select("module_key,is_enabled")
        .eq("tenant_id", currentTenant.id)
        .eq("is_enabled", true);
      if (cancelled) return;
      if (error) {
        console.error("Error loading tenant modules:", error);
        setEnabledModules([]);
        return;
      }
      setEnabledModules((data || []).map((r: { module_key: string }) => r.module_key));
    })();
    return () => { cancelled = true; };
  }, [currentTenant]);

  const hasModule = (moduleKey: string) => enabledModules.includes(moduleKey);

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        allTenants,
        isLoading,
        isSuperAdmin,
        isTenantAdmin,
        isTenantActive,
        enabledModules,
        hasModule,
        switchTenant,
        refreshTenants,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}

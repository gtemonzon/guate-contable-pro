import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  max_enterprises: number;
  max_users: number;
  plan_type: string;
}

interface TenantContextType {
  currentTenant: Tenant | null;
  allTenants: Tenant[];
  isLoading: boolean;
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
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

  // Apply tenant branding via CSS variables
  useEffect(() => {
    if (currentTenant) {
      document.documentElement.style.setProperty(
        "--tenant-primary", 
        currentTenant.primary_color
      );
      document.documentElement.style.setProperty(
        "--tenant-secondary", 
        currentTenant.secondary_color
      );
    }
  }, [currentTenant]);

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        allTenants,
        isLoading,
        isSuperAdmin,
        isTenantAdmin,
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

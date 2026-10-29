import { useCallback, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { buildIdentityArgs, mapIdentityError, type TenantIdentity } from "@/utils/tenantIdentity";

/** Guarda la identidad de la oficina actual vía la RPC update_tenant_identity. No muestra toasts. */
export function useSaveTenantIdentity() {
  const { currentTenant, refreshTenants } = useTenant();
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (patch: Partial<TenantIdentity>): Promise<void> => {
      if (!currentTenant) throw new Error("Oficina no encontrada.");
      const current: TenantIdentity = {
        tenant_name: currentTenant.tenant_name,
        contact_email: currentTenant.contact_email,
        contact_phone: currentTenant.contact_phone,
        primary_color: currentTenant.primary_color,
        secondary_color: currentTenant.secondary_color,
        logo_url: currentTenant.logo_url,
        pdf_font_family: currentTenant.pdf_font_family || "helvetica",
        pdf_font_size: currentTenant.pdf_font_size || 8,
      };
      setSaving(true);
      try {
        const args = buildIdentityArgs(currentTenant.id, current, patch);
        const { error } = await supabase.rpc("update_tenant_identity", args);
        if (error) throw new Error(mapIdentityError(error));
        await refreshTenants();
      } finally {
        setSaving(false);
      }
    },
    [currentTenant, refreshTenants]
  );

  return { save, saving };
}

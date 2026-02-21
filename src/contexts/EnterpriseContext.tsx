/**
 * EnterpriseContext — single source of truth for the current enterprise.
 *
 * Strategy:
 * 1. On mount, fetch the authenticated user's allowed enterprises from DB.
 * 2. Choose the last_enterprise_id if still valid, otherwise the first one.
 * 3. Expose selectedEnterpriseId / selectedEnterprise via context.
 * 4. Write the selection to localStorage only as a UX hint (for backward
 *    compatibility with code that still reads it) — it is NEVER trusted for
 *    security; all isolation is enforced server-side by RLS.
 * 5. On enterprise switch, invalidate React Query cache for affected keys.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";

export interface EnterpriseOption {
  id: number;
  business_name: string;
  trade_name: string | null;
  nit: string;
  is_active: boolean;
  tax_regime: string;
}

interface EnterpriseContextType {
  /** All enterprises the user is linked to */
  enterprises: EnterpriseOption[];
  /** The currently selected enterprise (null while loading or if none assigned) */
  selectedEnterprise: EnterpriseOption | null;
  /** Convenience numeric id (null if none selected) */
  selectedEnterpriseId: number | null;
  isLoading: boolean;
  /** Switch to a different enterprise */
  switchEnterprise: (enterpriseId: number) => Promise<void>;
  /** Re-fetch enterprise list from DB */
  refreshEnterprises: () => Promise<void>;
}

const EnterpriseContext = createContext<EnterpriseContextType | undefined>(undefined);

const LS_KEY = "currentEnterpriseId";

export function EnterpriseProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { currentTenant, isSuperAdmin } = useTenant();
  const [enterprises, setEnterprises] = useState<EnterpriseOption[]>([]);
  const [selectedEnterpriseId, setSelectedEnterpriseId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedEnterprise = enterprises.find((e) => e.id === selectedEnterpriseId) ?? null;

  /** Persist selection as a UX hint and notify legacy listeners */
  const persist = useCallback((id: number | null) => {
    if (id === null) {
      localStorage.removeItem(LS_KEY);
    } else {
      localStorage.setItem(LS_KEY, id.toString());
    }
    window.dispatchEvent(new CustomEvent("enterpriseChanged", { detail: { enterpriseId: id } }));
  }, []);

  const loadEnterprises = useCallback(async () => {
    try {
      setIsLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setEnterprises([]);
        setSelectedEnterpriseId(null);
        persist(null);
        return;
      }

      // Fetch all enterprises this user is linked to
      const { data: links, error: linksError } = await supabase
        .from("tab_user_enterprises")
        .select("enterprise_id")
        .eq("user_id", user.id)
        .is("deleted_at", null);

      if (linksError) throw linksError;

      const ids = (links ?? []).map((l) => l.enterprise_id as number);

      if (ids.length === 0) {
        setEnterprises([]);
        setSelectedEnterpriseId(null);
        persist(null);
        return;
      }

      let query = supabase
        .from("tab_enterprises")
        .select("id, business_name, trade_name, nit, is_active, tax_regime")
        .in("id", ids)
        .eq("is_active", true);

      // For super admins, filter by the currently selected tenant
      if (isSuperAdmin && currentTenant?.id) {
        query = query.eq("tenant_id", currentTenant.id);
      }

      const { data: ents, error: entsError } = await query.order("business_name");

      if (entsError) throw entsError;

      const list = (ents ?? []) as EnterpriseOption[];
      setEnterprises(list);

      if (list.length === 0) {
        setSelectedEnterpriseId(null);
        persist(null);
        return;
      }

      // Determine which enterprise to select:
      // Priority 1: last_enterprise_id from DB (if still in the valid list)
      // Priority 2: hint from localStorage (if valid)
      // Priority 3: first in list

      const { data: userData } = await supabase
        .from("tab_users")
        .select("last_enterprise_id")
        .eq("id", user.id)
        .single();

      const dbLastId = userData?.last_enterprise_id as number | null;
      const lsHint = Number(localStorage.getItem(LS_KEY)) || null;

      const validIds = new Set(list.map((e) => e.id));

      let chosen: number;
      if (dbLastId && validIds.has(dbLastId)) {
        chosen = dbLastId;
      } else if (lsHint && validIds.has(lsHint)) {
        chosen = lsHint;
      } else {
        chosen = list[0].id;
      }

      setSelectedEnterpriseId(chosen);
      persist(chosen);
    } catch (err) {
      console.error("[EnterpriseContext] loadEnterprises error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [persist, isSuperAdmin, currentTenant?.id]);

  const switchEnterprise = useCallback(async (enterpriseId: number) => {
    setSelectedEnterpriseId(enterpriseId);
    persist(enterpriseId);

    // Persist to DB so the preference survives across devices
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("tab_users")
        .update({ last_enterprise_id: enterpriseId })
        .eq("id", user.id);
    }

    // Invalidate all enterprise-scoped React Query caches
    queryClient.invalidateQueries();
  }, [persist, queryClient]);

  const refreshEnterprises = useCallback(async () => {
    await loadEnterprises();
  }, [loadEnterprises]);

  // Reload on mount, auth changes, or tenant switch
  useEffect(() => {
    loadEnterprises();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadEnterprises();
      } else {
        setEnterprises([]);
        setSelectedEnterpriseId(null);
        persist(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadEnterprises, persist, currentTenant?.id]);

  return (
    <EnterpriseContext.Provider
      value={{
        enterprises,
        selectedEnterprise,
        selectedEnterpriseId,
        isLoading,
        switchEnterprise,
        refreshEnterprises,
      }}
    >
      {children}
    </EnterpriseContext.Provider>
  );
}

export function useEnterprise() {
  const ctx = useContext(EnterpriseContext);
  if (!ctx) throw new Error("useEnterprise must be used within EnterpriseProvider");
  return ctx;
}

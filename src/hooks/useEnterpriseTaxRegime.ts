import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getFiscalBookStrategy, type FiscalBookStrategy } from "@/services/fiscalBookStrategy";

interface UseEnterpriseTaxRegimeResult {
  regime: string | null;
  strategy: FiscalBookStrategy;
  loading: boolean;
}

/**
 * Reads the active enterprise's VAT tax regime and returns the matching
 * fiscal book strategy. Listens to enterprise switches via the existing
 * `enterpriseChanged` + `storage` events.
 */
export function useEnterpriseTaxRegime(enterpriseIdOverride?: number | string | null): UseEnterpriseTaxRegimeResult {
  const [regime, setRegime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const id =
        enterpriseIdOverride != null
          ? String(enterpriseIdOverride)
          : localStorage.getItem("currentEnterpriseId");

      if (!id) {
        if (!cancelled) {
          setRegime(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data } = await supabase
        .from("tab_enterprises")
        .select("tax_regime")
        .eq("id", parseInt(id))
        .maybeSingle();

      if (!cancelled) {
        setRegime(data?.tax_regime ?? null);
        setLoading(false);
      }
    };

    load();

    if (enterpriseIdOverride != null) {
      return () => {
        cancelled = true;
      };
    }

    const handler = () => load();
    window.addEventListener("storage", handler);
    window.addEventListener("enterpriseChanged", handler);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handler);
      window.removeEventListener("enterpriseChanged", handler);
    };
  }, [enterpriseIdOverride]);

  return {
    regime,
    strategy: getFiscalBookStrategy(regime),
    loading,
  };
}

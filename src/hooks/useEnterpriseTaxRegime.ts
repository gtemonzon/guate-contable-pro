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
 *
 * When `asOfDate` (YYYY-MM-DD) is provided, resolves the regime that was
 * effective on that date from `tab_enterprise_tax_regime_history` instead of
 * the enterprise's current regime — needed because a company can change tax
 * regime over its lifetime, and viewing a past month must reflect the regime
 * that applied back then, not the one it has today.
 */
export function useEnterpriseTaxRegime(
  enterpriseIdOverride?: number | string | null,
  asOfDate?: string
): UseEnterpriseTaxRegimeResult {
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
      const enterpriseId = parseInt(id);

      if (asOfDate) {
        const { data: historyRows } = await supabase
          .from("tab_enterprise_tax_regime_history")
          .select("tax_regime")
          .eq("enterprise_id", enterpriseId)
          .lte("effective_from", asOfDate)
          .order("effective_from", { ascending: false })
          .limit(1);

        if (historyRows && historyRows.length > 0) {
          if (!cancelled) {
            setRegime(historyRows[0].tax_regime);
            setLoading(false);
          }
          return;
        }
      }

      const { data } = await supabase
        .from("tab_enterprises")
        .select("tax_regime")
        .eq("id", enterpriseId)
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
  }, [enterpriseIdOverride, asOfDate]);

  return {
    regime,
    strategy: getFiscalBookStrategy(regime),
    loading,
  };
}

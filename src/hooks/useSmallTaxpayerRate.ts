import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_RATE = 5;

interface UseSmallTaxpayerRateResult {
  rate: number;
  loading: boolean;
}

/**
 * Reads the configured Pequeño Contribuyente fixed tax rate (tax_form_type =
 * 'IVA_PEQUENO') for an enterprise. Falls back to the standard 5% when no
 * active configuration row exists.
 */
export function useSmallTaxpayerRate(enterpriseId: number | null): UseSmallTaxpayerRateResult {
  const [rate, setRate] = useState<number>(DEFAULT_RATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!enterpriseId) {
        if (!cancelled) {
          setRate(DEFAULT_RATE);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data } = await supabase
        .from("tab_enterprise_tax_config")
        .select("tax_rate")
        .eq("enterprise_id", enterpriseId)
        .eq("tax_form_type", "IVA_PEQUENO")
        .eq("is_active", true)
        .maybeSingle();

      if (!cancelled) {
        setRate(data?.tax_rate != null ? Number(data.tax_rate) : DEFAULT_RATE);
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [enterpriseId]);

  return { rate, loading };
}

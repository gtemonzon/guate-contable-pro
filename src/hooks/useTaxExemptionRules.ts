import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaxExemptionRule } from "@/utils/taxExemption";

/**
 * Reglas de exención activas (tab_tax_exemption_rules, globales). Se cachean 5 min:
 * cambian muy rara vez y las consultan muchas tarjetas de compra a la vez.
 *
 * `isLoaded` indica que la lista es confiable para resolver en vivo; mientras sea
 * false, las filas guardadas usan su sello (exemption_rule_code).
 */
export function useTaxExemptionRules() {
  const query = useQuery({
    queryKey: ["tax-exemption-rules", "active"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TaxExemptionRule[]> => {
      const { data, error } = await supabase
        .from("tab_tax_exemption_rules")
        .select("id, code, name, legal_reference, operation_type_code, applies_to, valid_from, valid_to, vat_rate, blocks_idp, is_active, notes")
        .eq("is_active", true)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, vat_rate: Number(r.vat_rate) || 0 })) as TaxExemptionRule[];
    },
  });

  return {
    rules: query.data ?? [],
    isLoaded: query.isSuccess,
    isLoading: query.isLoading,
    error: query.error,
  };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<number, string>();

/** Devuelve la moneda funcional (base) de la empresa. Por defecto GTQ. */
export function useEnterpriseBaseCurrency(enterpriseId: number | null) {
  const [code, setCode] = useState<string>(
    enterpriseId && cache.has(enterpriseId) ? cache.get(enterpriseId)! : "GTQ"
  );

  useEffect(() => {
    if (!enterpriseId) return;
    if (cache.has(enterpriseId)) {
      setCode(cache.get(enterpriseId)!);
      return;
    }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("tab_enterprises")
        .select("base_currency_code")
        .eq("id", enterpriseId)
        .maybeSingle();
      const c = data?.base_currency_code || "GTQ";
      cache.set(enterpriseId, c);
      if (!cancel) setCode(c);
    })();
    return () => { cancel = true; };
  }, [enterpriseId]);

  return code;
}

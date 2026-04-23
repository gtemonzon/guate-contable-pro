import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Currency {
  id: number;
  currency_code: string;
  currency_name: string;
  symbol: string;
  is_active: boolean | null;
}

let cache: Currency[] | null = null;

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let cancel = false;
    (async () => {
      const { data, error } = await supabase
        .from("tab_currencies")
        .select("*")
        .eq("is_active", true)
        .order("currency_code");
      if (!cancel && !error && data) {
        cache = data as Currency[];
        setCurrencies(cache);
      }
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  const getByCode = (code: string) =>
    currencies.find((c) => c.currency_code === code);

  return { currencies, loading, getByCode };
}

export function formatCurrency(amount: number, code: string = "GTQ"): string {
  const symbols: Record<string, string> = {
    GTQ: "Q", USD: "$", EUR: "€", MXN: "MX$", CRC: "₡", HNL: "L", COP: "COL$",
  };
  const symbol = symbols[code] ?? code;
  return `${symbol} ${new Intl.NumberFormat("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

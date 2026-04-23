import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExchangeRate {
  id: number;
  enterprise_id: number;
  currency_code: string;
  year: number;
  month: number;
  rate: number;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useExchangeRates(enterpriseId: number | null) {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enterpriseId) { setRates([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("tab_exchange_rates")
      .select("*")
      .eq("enterprise_id", enterpriseId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (!error && data) setRates(data as ExchangeRate[]);
    setLoading(false);
  }, [enterpriseId]);

  useEffect(() => { load(); }, [load]);

  const upsert = async (input: {
    currency_code: string;
    year: number;
    month: number;
    rate: number;
    source?: string;
    notes?: string;
  }) => {
    if (!enterpriseId) return false;
    const existing = rates.find(
      (r) => r.currency_code === input.currency_code && r.year === input.year && r.month === input.month
    );
    if (existing) {
      const { error } = await supabase
        .from("tab_exchange_rates")
        .update({
          rate: input.rate,
          source: input.source ?? null,
          notes: input.notes ?? null,
        })
        .eq("id", existing.id);
      if (error) { toast.error(error.message); return false; }
    } else {
      const { error } = await supabase
        .from("tab_exchange_rates")
        .insert({
          enterprise_id: enterpriseId,
          currency_code: input.currency_code,
          year: input.year,
          month: input.month,
          rate: input.rate,
          source: input.source ?? null,
          notes: input.notes ?? null,
        });
      if (error) { toast.error(error.message); return false; }
    }
    toast.success("Tipo de cambio guardado");
    await load();
    return true;
  };

  const remove = async (id: number) => {
    const { error } = await supabase.from("tab_exchange_rates").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    await load();
    return true;
  };

  /** Devuelve la tasa para una moneda en una fecha dada (mes/año). */
  const getRate = (currency_code: string, date: Date | string): number | null => {
    const d = typeof date === "string" ? new Date(date) : date;
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const found = rates.find(
      (r) => r.currency_code === currency_code && r.year === year && r.month === month
    );
    return found ? Number(found.rate) : null;
  };

  /** Cuántas transacciones existen para una tasa específica */
  const countTransactionsForRate = async (currency_code: string, year: number, month: number) => {
    if (!enterpriseId) return 0;
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = new Date(year, month, 0).toISOString().slice(0, 10);
    const [je, pl, sl] = await Promise.all([
      supabase.from("tab_journal_entries").select("id", { count: "exact", head: true })
        .eq("enterprise_id", enterpriseId).eq("currency_code", currency_code)
        .gte("entry_date", start).lte("entry_date", endDate),
      supabase.from("tab_purchase_ledger").select("id", { count: "exact", head: true })
        .eq("enterprise_id", enterpriseId).eq("currency_code", currency_code)
        .gte("invoice_date", start).lte("invoice_date", endDate),
      supabase.from("tab_sales_ledger").select("id", { count: "exact", head: true })
        .eq("enterprise_id", enterpriseId).eq("currency_code", currency_code)
        .gte("invoice_date", start).lte("invoice_date", endDate),
    ]);
    return (je.count ?? 0) + (pl.count ?? 0) + (sl.count ?? 0);
  };

  return { rates, loading, upsert, remove, getRate, countTransactionsForRate, reload: load };
}

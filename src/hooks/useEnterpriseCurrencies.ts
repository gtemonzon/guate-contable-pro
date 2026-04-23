import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EnterpriseCurrency {
  id: number;
  enterprise_id: number;
  currency_code: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export function useEnterpriseCurrencies(enterpriseId: number | null) {
  const [items, setItems] = useState<EnterpriseCurrency[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enterpriseId) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("tab_enterprise_currencies")
      .select("*")
      .eq("enterprise_id", enterpriseId)
      .order("currency_code");
    if (!error && data) setItems(data as EnterpriseCurrency[]);
    setLoading(false);
  }, [enterpriseId]);

  useEffect(() => { load(); }, [load]);

  const add = async (currency_code: string, notes?: string) => {
    if (!enterpriseId) return false;
    const { error } = await supabase
      .from("tab_enterprise_currencies")
      .insert({ enterprise_id: enterpriseId, currency_code, notes: notes ?? null });
    if (error) {
      toast.error("Error al agregar moneda: " + error.message);
      return false;
    }
    toast.success(`Moneda ${currency_code} habilitada`);
    await load();
    return true;
  };

  const remove = async (id: number, code: string) => {
    // Comprobar si hay transacciones registradas en esa moneda
    if (!enterpriseId) return false;
    const checks = await Promise.all([
      supabase.from("tab_journal_entries").select("id", { count: "exact", head: true })
        .eq("enterprise_id", enterpriseId).eq("currency_code", code),
      supabase.from("tab_purchase_ledger").select("id", { count: "exact", head: true })
        .eq("enterprise_id", enterpriseId).eq("currency_code", code),
      supabase.from("tab_sales_ledger").select("id", { count: "exact", head: true })
        .eq("enterprise_id", enterpriseId).eq("currency_code", code),
    ]);
    const total = (checks[0].count ?? 0) + (checks[1].count ?? 0) + (checks[2].count ?? 0);
    if (total > 0) {
      toast.error(`No se puede quitar: hay ${total} transacciones registradas en ${code}.`);
      return false;
    }
    const { error } = await supabase.from("tab_enterprise_currencies").delete().eq("id", id);
    if (error) { toast.error(error.message); return false; }
    toast.success(`Moneda ${code} retirada`);
    await load();
    return true;
  };

  return { items, loading, add, remove, reload: load };
}

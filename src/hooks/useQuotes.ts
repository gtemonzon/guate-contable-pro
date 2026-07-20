import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type QuoteStatus = "elaborada" | "enviada" | "confirmada" | "no_aceptada";

export const STATUS_LABELS: Record<QuoteStatus, string> = {
  elaborada: "Elaborada",
  enviada: "Enviada",
  confirmada: "Confirmada",
  no_aceptada: "No aceptada",
};

export const STATUS_BADGE_CLASS: Record<QuoteStatus, string> = {
  elaborada: "bg-muted text-muted-foreground",
  enviada: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30",
  confirmada: "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30",
  no_aceptada: "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30",
};

export interface QuoteItem {
  id?: string;
  quote_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
}

export interface Quote {
  id: string;
  quote_number: string;
  client_name: string;
  client_nit: string | null;
  client_contact: string | null;
  issue_date: string;
  valid_until: string | null;
  status: QuoteStatus;
  notes: string | null;
  subtotal: number;
  total: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteStatusHistoryRow {
  id: string;
  quote_id: string;
  status: QuoteStatus;
  changed_by: string;
  changed_by_name: string;
  changed_at: string;
}

export interface PriceCatalogItem {
  id: string;
  description: string;
  default_unit_price: number;
  is_active: boolean;
  sort_order: number;
}

export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tab_quotes" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setQuotes(data as unknown as Quote[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { quotes, loading, reload: load };
}

export async function fetchQuoteItems(quoteId: string): Promise<QuoteItem[]> {
  const { data, error } = await supabase
    .from("tab_quote_items" as never)
    .select("*")
    .eq("quote_id", quoteId)
    .order("sort_order");
  if (error || !data) return [];
  return data as unknown as QuoteItem[];
}

export async function fetchQuoteHistory(quoteId: string): Promise<QuoteStatusHistoryRow[]> {
  const { data, error } = await supabase
    .from("tab_quote_status_history" as never)
    .select("*")
    .eq("quote_id", quoteId)
    .order("changed_at", { ascending: true });
  if (error || !data) return [];
  return data as unknown as QuoteStatusHistoryRow[];
}

export function usePriceCatalog() {
  const [items, setItems] = useState<PriceCatalogItem[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tab_quote_price_catalog" as never)
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (data) setItems(data as unknown as PriceCatalogItem[]);
    })();
  }, []);
  return items;
}

export async function generateQuoteNumber(): Promise<string> {
  const { data, error } = await supabase.rpc("generate_quote_number" as never);
  if (error || !data) {
    const y = new Date().getFullYear();
    return `COT-${y}-001`;
  }
  return data as unknown as string;
}

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LinkSource = 'FROM_JOURNAL_MODAL' | 'FROM_PURCHASES' | 'MANUAL_LINK' | 'BACKFILL';

interface LinkParams {
  enterpriseId: number;
  purchaseId: number;
  journalEntryId: number;
  linkSource: LinkSource;
}

/**
 * Hook for managing purchase-to-journal-entry links via tab_purchase_journal_links.
 * The DB trigger automatically syncs journal_entry_id on tab_purchase_ledger.
 */
export function usePurchaseJournalLinks() {

  const createLink = useCallback(async ({ enterpriseId, purchaseId, journalEntryId, linkSource }: LinkParams) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    const { error } = await supabase
      .from("tab_purchase_journal_links" as any)
      .upsert({
        enterprise_id: enterpriseId,
        purchase_id: purchaseId,
        journal_entry_id: journalEntryId,
        link_source: linkSource,
        linked_by: user.id,
        linked_at: new Date().toISOString(),
      }, { onConflict: "enterprise_id,purchase_id" });

    if (error) throw error;
  }, []);

  const createLinks = useCallback(async (
    enterpriseId: number,
    purchaseIds: number[],
    journalEntryId: number,
    linkSource: LinkSource,
  ) => {
    if (purchaseIds.length === 0) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Usuario no autenticado");

    const rows = purchaseIds.map(pid => ({
      enterprise_id: enterpriseId,
      purchase_id: pid,
      journal_entry_id: journalEntryId,
      link_source: linkSource,
      linked_by: user.id,
      linked_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("tab_purchase_journal_links" as any)
      .upsert(rows, { onConflict: "enterprise_id,purchase_id" });

    if (error) throw error;
  }, []);

  const removeLink = useCallback(async (enterpriseId: number, purchaseId: number) => {
    const { error } = await supabase
      .from("tab_purchase_journal_links" as any)
      .delete()
      .eq("enterprise_id", enterpriseId)
      .eq("purchase_id", purchaseId);

    if (error) throw error;
  }, []);

  const removeLinksForEntry = useCallback(async (enterpriseId: number, journalEntryId: number) => {
    const { error } = await supabase
      .from("tab_purchase_journal_links" as any)
      .delete()
      .eq("enterprise_id", enterpriseId)
      .eq("journal_entry_id", journalEntryId);

    if (error) throw error;
  }, []);

  const getLinksForEntry = useCallback(async (journalEntryId: number) => {
    const { data, error } = await supabase
      .from("tab_purchase_journal_links" as any)
      .select("*")
      .eq("journal_entry_id", journalEntryId);

    if (error) throw error;
    return data || [];
  }, []);

  const getUnlinkedPurchases = useCallback(async (
    enterpriseId: number,
    month?: number,
    year?: number,
    search?: string,
  ) => {
    // Get all purchase IDs that already have links
    const { data: linked } = await supabase
      .from("tab_purchase_journal_links" as any)
      .select("purchase_id")
      .eq("enterprise_id", enterpriseId);

    const linkedIds = (linked || []).map((l: any) => l.purchase_id);

    let query = supabase
      .from("tab_purchase_ledger")
      .select("*")
      .eq("enterprise_id", enterpriseId)
      .is("deleted_at", null)
      .order("invoice_date", { ascending: true });

    // Also exclude those with journal_entry_id already set (legacy)
    query = query.is("journal_entry_id", null);

    if (month && year) {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      query = query.gte("invoice_date", startDate).lte("invoice_date", endDate);
    }

    if (search) {
      query = query.or(`supplier_name.ilike.%${search}%,supplier_nit.ilike.%${search}%,invoice_number.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Filter out any that are in the links table
    return (data || []).filter((p: any) => !linkedIds.includes(p.id));
  }, []);

  const getLinkForPurchase = useCallback(async (enterpriseId: number, purchaseId: number) => {
    const { data, error } = await supabase
      .from("tab_purchase_journal_links" as any)
      .select("*, tab_journal_entries!inner(entry_number, id)")
      .eq("enterprise_id", enterpriseId)
      .eq("purchase_id", purchaseId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }, []);

  return {
    createLink,
    createLinks,
    removeLink,
    removeLinksForEntry,
    getLinksForEntry,
    getUnlinkedPurchases,
    getLinkForPurchase,
  };
}

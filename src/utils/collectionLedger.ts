import { supabase } from "@/integrations/supabase/client";

// Looks up third-party name + document number for a set of source ledger ids.
// Split by direction (rather than a dynamic table/column name) because
// Supabase's typed client can't correlate two separately-computed literal
// unions (table name + column name) that are only valid in matching pairs —
// it type-checks every combination, including the invalid ones.
//
// The map contains ONLY invoices that still exist in the ledger (not soft-deleted).
// Callers use "absent from the map" to mean "invoice deleted" and hide its tracking
// row, so this must be complete: ids are queried in chunks (a single huge .in()
// can exceed the URL length or PostgREST's row cap and silently drop live
// invoices), and any error throws instead of returning a partial map.
const LEDGER_LOOKUP_CHUNK = 200;

export async function fetchLedgerNamesMap(
  direction: "cxc" | "cxp",
  ids: number[],
): Promise<Map<number, { name: string; doc: string }>> {
  const map = new Map<number, { name: string; doc: string }>();
  const uniqueIds = Array.from(new Set(ids));
  for (let i = 0; i < uniqueIds.length; i += LEDGER_LOOKUP_CHUNK) {
    const chunk = uniqueIds.slice(i, i + LEDGER_LOOKUP_CHUNK);
    if (direction === "cxc") {
      const { data, error } = await supabase
        .from("tab_sales_ledger")
        .select("id,customer_name,invoice_series,invoice_number")
        .is("deleted_at", null)
        .in("id", chunk);
      if (error) throw error;
      (data || []).forEach((l) => {
        map.set(l.id, {
          name: l.customer_name || "",
          doc: [l.invoice_series, l.invoice_number].filter(Boolean).join("-"),
        });
      });
    } else {
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("id,supplier_name,invoice_series,invoice_number")
        .is("deleted_at", null)
        .in("id", chunk);
      if (error) throw error;
      (data || []).forEach((l) => {
        map.set(l.id, {
          name: l.supplier_name || "",
          doc: [l.invoice_series, l.invoice_number].filter(Boolean).join("-"),
        });
      });
    }
  }
  return map;
}

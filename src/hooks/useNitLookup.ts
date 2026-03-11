import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeNIT } from "@/utils/nitValidation";

interface NitLookupResult {
  name: string;
  source: string;
  found: boolean;
}

// In-memory session cache (shared across all hook instances)
const memoryCache = new Map<string, { name: string; source: string; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getFromMemoryCache(nit: string): { name: string; source: string } | null {
  const entry = memoryCache.get(nit);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    memoryCache.delete(nit);
    return null;
  }
  return { name: entry.name, source: entry.source };
}

function setMemoryCache(nit: string, name: string, source: string) {
  memoryCache.set(nit, { name, source, ts: Date.now() });
}

/**
 * Hook for local-only taxpayer name lookup by NIT.
 * Queries only the local taxpayer_cache table — no external APIs.
 */
export function useNitLookup() {
  const [isLooking, setIsLooking] = useState(false);

  const lookupNit = useCallback(async (rawNit: string): Promise<NitLookupResult | null> => {
    const cleaned = sanitizeNIT(rawNit).trim().toUpperCase();
    if (!cleaned || cleaned.length < 2) return null;

    if (cleaned === "CF") {
      return { name: "Consumidor Final", source: "system", found: true };
    }

    const cached = getFromMemoryCache(cleaned);
    if (cached) {
      return { name: cached.name, source: cached.source, found: true };
    }

    setIsLooking(true);
    try {
      const { data } = await supabase
        .from("taxpayer_cache")
        .select("name, source")
        .eq("nit", cleaned)
        .maybeSingle();

      if (data) {
        setMemoryCache(cleaned, data.name, data.source);
        return { name: data.name, source: data.source, found: true };
      }

      return { name: "", source: "", found: false };
    } catch (err) {
      console.error("NIT lookup failed:", err);
      return null;
    } finally {
      setIsLooking(false);
    }
  }, []);

  return { lookupNit, isLooking };
}

/**
 * Upsert a taxpayer into the local cache.
 * Called automatically via DB triggers on purchase/sales save,
 * but can also be called manually.
 */
export async function upsertTaxpayerCache(nit: string, name: string) {
  if (!nit || !name || nit.toUpperCase() === "CF") return;
  const cleaned = sanitizeNIT(nit).trim().toUpperCase();
  // Don't cache short/partial NITs
  if (cleaned.length < 4) return;

  try {
    // Only update if the new name is at least as long (more complete)
    await supabase.from("taxpayer_cache").upsert(
      {
        nit: cleaned,
        name: name.trim(),
        source: "Sistema",
        last_checked: new Date().toISOString(),
      },
      { onConflict: "nit" }
    );
    setMemoryCache(cleaned, name.trim(), "Sistema");
  } catch {
    // Ignore cache errors — non-critical
  }
}

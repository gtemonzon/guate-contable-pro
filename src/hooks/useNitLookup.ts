import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validateNIT, sanitizeNIT } from "@/utils/nitValidation";

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
 * Hook for automatic taxpayer name lookup by NIT.
 * 
 * Usage:
 * ```
 * const { lookupNit, isLooking } = useNitLookup();
 * // On NIT blur:
 * const result = await lookupNit(nitValue);
 * if (result?.found && !currentName) setName(result.name);
 * ```
 */
export function useNitLookup() {
  const [isLooking, setIsLooking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const lookupNit = useCallback(async (rawNit: string): Promise<NitLookupResult | null> => {
    const cleaned = sanitizeNIT(rawNit).trim().toUpperCase();

    // Quick exits
    if (!cleaned || cleaned.length < 2) return null;
    if (!validateNIT(rawNit)) return null;

    // CF shortcut
    if (cleaned === "CF") {
      return { name: "Consumidor Final", source: "system", found: true };
    }

    // Check memory cache first
    const cached = getFromMemoryCache(cleaned);
    if (cached) {
      return { name: cached.name, source: cached.source, found: true };
    }

    // Abort previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLooking(true);
    try {
      const { data, error } = await supabase.functions.invoke("lookup-nit", {
        body: { nit: cleaned },
      });

      if (controller.signal.aborted) return null;

      if (error) {
        console.error("NIT lookup error:", error);
        return null;
      }

      if (data?.found) {
        setMemoryCache(cleaned, data.name, data.source);
        return { name: data.name, source: data.source, found: true };
      }

      return { name: "", source: "", found: false };
    } catch (err: any) {
      if (err?.name === "AbortError") return null;
      console.error("NIT lookup failed:", err);
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setIsLooking(false);
      }
    }
  }, []);

  return { lookupNit, isLooking };
}

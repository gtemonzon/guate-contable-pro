import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 8_000;
const FAILURES_BEFORE_OFFLINE = 2;

interface OnlineStatus {
  isOnline: boolean;
  lastChecked: Date | null;
}

/**
 * Detects loss of internet connectivity through:
 * - browser online/offline events
 * - lightweight periodic ping to Supabase (tab_currencies)
 *
 * Anti-flicker: requires N consecutive ping failures before flipping to offline.
 * Pauses pings while the tab is hidden.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const failuresRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const ping = async () => {
      if (inFlightRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      inFlightRef.current = true;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

        // Lightweight query — we only care that the network responds.
        // RLS errors are still a "successful" network response.
        const promise = supabase
          .from("tab_currencies")
          .select("id")
          .limit(1)
          .abortSignal(controller.signal);

        const { error } = await promise;
        clearTimeout(timeoutId);

        if (cancelled) return;

        // A returned error object from supabase-js typically means we DID
        // reach the server (e.g. RLS, validation). A thrown error (caught
        // below) is what indicates a real network failure.
        const reachable = !error || (error.message && !/fetch|network|abort/i.test(error.message));

        if (reachable) {
          failuresRef.current = 0;
          setIsOnline(true);
        } else {
          failuresRef.current += 1;
          if (failuresRef.current >= FAILURES_BEFORE_OFFLINE) {
            setIsOnline(false);
          }
        }
      } catch {
        if (cancelled) return;
        failuresRef.current += 1;
        if (failuresRef.current >= FAILURES_BEFORE_OFFLINE) {
          setIsOnline(false);
        }
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setLastChecked(new Date());
      }
    };

    const handleOnline = () => {
      // Reset failure count and verify with a real ping.
      failuresRef.current = 0;
      setIsOnline(true);
      ping();
    };

    const handleOffline = () => {
      failuresRef.current = FAILURES_BEFORE_OFFLINE;
      setIsOnline(false);
    };

    const handleVisibility = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        ping();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    // Initial check + periodic
    ping();
    intervalId = setInterval(ping, PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return { isOnline, lastChecked };
}

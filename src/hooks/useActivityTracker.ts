import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseActivityTrackerProps {
  userId: string | undefined;
  enterpriseName: string;
}

export const useActivityTracker = ({ userId, enterpriseName }: UseActivityTrackerProps) => {
  const lastUpdateRef = useRef<Date | null>(null);
  const isActiveRef = useRef(true);
  const UPDATE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos

  const updateActivity = useCallback(async () => {
    if (!userId) return;
    
    const now = new Date();
    
    // Solo actualizar si han pasado al menos 2 minutos desde la última actualización
    if (lastUpdateRef.current && (now.getTime() - lastUpdateRef.current.getTime()) < UPDATE_INTERVAL_MS) {
      return;
    }

    try {
      const { error } = await supabase
        .from("tab_users")
        .update({
          last_activity_at: now.toISOString(),
          current_enterprise_name: enterpriseName || null,
        })
        .eq("id", userId);

      if (error) {
        console.error("Error updating activity:", error);
        return;
      }

      lastUpdateRef.current = now;
    } catch (error) {
      console.error("Error updating activity:", error);
    }
  }, [userId, enterpriseName]);

  useEffect(() => {
    if (!userId) return;

    // Actualizar inmediatamente al montar
    updateActivity();

    // Configurar intervalo para actualizaciones periódicas
    const intervalId = setInterval(() => {
      if (isActiveRef.current) {
        updateActivity();
      }
    }, UPDATE_INTERVAL_MS);

    // Detectar actividad del usuario
    const handleActivity = () => {
      isActiveRef.current = true;
      updateActivity();
    };

    // Detectar inactividad
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActiveRef.current = false;
      } else {
        isActiveRef.current = true;
        updateActivity();
      }
    };

    // Eventos de actividad
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("touchstart", handleActivity);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId, updateActivity]);
};

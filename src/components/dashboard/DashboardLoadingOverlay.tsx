import { useEffect, useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import type { DashboardModule } from "@/hooks/dashboard/useDashboardProgress";

interface DashboardLoadingOverlayProps {
  modules: DashboardModule[];
  readyCount: number;
  totalCount: number;
  progress: number;
  allDone: boolean;
  /** When this key changes the overlay resets to visible */
  resetKey?: string;
}

export function DashboardLoadingOverlay({
  modules,
  readyCount,
  totalCount,
  progress,
  allDone,
  resetKey,
}: DashboardLoadingOverlayProps) {
  const [visible, setVisible] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);
  const prevKeyRef = useRef(resetKey);

  // Reset overlay visibility when the resetKey changes
  useEffect(() => {
    if (prevKeyRef.current !== resetKey) {
      prevKeyRef.current = resetKey;
      setVisible(true);
      setFadingOut(false);
    }
  }, [resetKey]);

  useEffect(() => {
    if (allDone && !fadingOut) {
      setFadingOut(true);
      const t = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(t);
    }
  }, [allDone, fadingOut]);

  if (!visible) return null;

  return (
    <div
      className={`absolute inset-0 z-30 overflow-hidden transition-opacity duration-500 ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ backgroundColor: "hsl(var(--background) / 0.75)" }}
    >
      <div className="sticky top-24 flex justify-center pt-12">
        <div className="flex flex-col items-center gap-5 max-w-xs w-full px-6">
        {/* Spinner */}
        <div className="relative">
          <Loader2 className="h-10 w-10 text-primary animate-spin" />
        </div>

        {/* Text */}
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">Cargando dashboard…</p>
          <p className="text-xs text-muted-foreground">
            {readyCount} de {totalCount} módulos listos
          </p>
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="h-2 w-full" />

        {/* Module list */}
        <div className="w-full space-y-1">
          {modules.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate mr-2">{m.label}</span>
              <span
                className={
                  m.status === "ready"
                    ? "text-success font-medium"
                    : m.status === "error"
                    ? "text-destructive font-medium"
                    : "text-muted-foreground"
                }
              >
                {m.status === "ready" ? "✓" : m.status === "error" ? "✗" : "…"}
              </span>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

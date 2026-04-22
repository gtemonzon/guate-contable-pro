import { useEffect, useRef } from "react";
import { WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineBanner() {
  const { isOnline } = useOnlineStatus();
  const previousRef = useRef<boolean>(isOnline);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    // Skip the very first render to avoid noisy toast on initial load.
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      previousRef.current = isOnline;
      return;
    }

    if (previousRef.current !== isOnline) {
      if (isOnline) {
        toast.success("Conexión restablecida", {
          description: "Ya puedes seguir trabajando con normalidad.",
        });
      } else {
        toast.error("Sin conexión a internet", {
          description: "Tus cambios no se guardarán hasta que se restablezca la conexión.",
          duration: 6000,
        });
      }
      previousRef.current = isOnline;
    }
  }, [isOnline]);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive backdrop-blur"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        Sin conexión a internet. Tus cambios no se guardarán hasta que se restablezca la conexión.
      </span>
    </div>
  );
}

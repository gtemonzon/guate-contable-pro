import { Check, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type SaveStatus = "idle" | "saving" | "saved";

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  className?: string;
}

export function SaveStatusIndicator({ status, className }: SaveStatusIndicatorProps) {
  if (status === "idle") return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center justify-center h-8 w-8 rounded-full transition-all duration-300",
              status === "saving" && "bg-amber-100 text-amber-600",
              status === "saved" && "bg-green-100 text-green-600",
              className
            )}
          >
            {status === "saving" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {status === "saved" && (
              <Check className="h-4 w-4" />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{status === "saving" ? "Guardando..." : "Datos guardados"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

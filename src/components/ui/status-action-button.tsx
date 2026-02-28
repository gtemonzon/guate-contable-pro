import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatusActionButtonProps {
  isActive: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "default" | "sm" | "icon";
  /** Show the badge next to the button */
  showBadge?: boolean;
}

export function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? "Activo" : "Inactivo"}
    </Badge>
  );
}

export function StatusActionButton({
  isActive,
  onToggle,
  disabled = false,
  size = "icon",
}: StatusActionButtonProps) {
  const label = isActive ? "Desactivar" : "Activar";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={size}
            onClick={onToggle}
            disabled={disabled}
            aria-label={label}
          >
            <Power
              className={`h-4 w-4 ${
                isActive
                  ? "text-green-600 dark:text-green-400"
                  : "text-muted-foreground"
              }`}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

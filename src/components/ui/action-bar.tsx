import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export interface ActionBarItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "ghost" | "outline" | "destructive";
  /** If true, show a separator before this item */
  separator?: boolean;
}

interface ActionBarProps {
  items: ActionBarItem[];
  className?: string;
}

/**
 * Contextual action bar rendered as a compact horizontal toolbar.
 * Used on detail panels and report views for cross-navigation.
 */
export default function ActionBar({ items, className }: ActionBarProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 px-2 py-1 bg-muted/40 border-b overflow-x-auto",
        className
      )}
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center">
          {item.separator && i > 0 && (
            <Separator orientation="vertical" className="h-4 mx-1" />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={item.variant || "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5 px-2 shrink-0"
                onClick={item.onClick}
                disabled={item.disabled}
              >
                {item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {item.label}
            </TooltipContent>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}

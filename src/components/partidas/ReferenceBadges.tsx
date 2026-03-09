import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FileText, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReferenceBadgesProps {
  references: string[];
  /** Max references to show before "+N more" (default 1) */
  maxVisible?: number;
  /** Compact mode for table cells */
  compact?: boolean;
  className?: string;
  /** Callback when a reference is clicked (optional) */
  onReferenceClick?: (ref: string) => void;
}

/**
 * Displays document references as compact badges.
 * Shows first N references inline and a "+X more" badge that opens a popover.
 */
export function ReferenceBadges({
  references,
  maxVisible = 1,
  compact = false,
  className,
  onReferenceClick,
}: ReferenceBadgesProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (!references || references.length === 0) return null;

  const visible = references.slice(0, maxVisible);
  const hidden = references.slice(maxVisible);

  return (
    <div className={cn("flex items-center gap-1 flex-wrap", className)}>
      <FileText className={cn("shrink-0 text-muted-foreground", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      {visible.map((ref, i) => (
        <Badge
          key={i}
          variant="outline"
          className={cn(
            "font-mono cursor-default",
            compact ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5",
            onReferenceClick && "cursor-pointer hover:bg-accent"
          )}
          onClick={onReferenceClick ? () => onReferenceClick(ref) : undefined}
        >
          {ref}
        </Badge>
      ))}
      {hidden.length > 0 && (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Badge
              variant="secondary"
              className={cn(
                "cursor-pointer hover:bg-accent gap-0.5",
                compact ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"
              )}
            >
              +{hidden.length}
              <ChevronDown className="h-3 w-3" />
            </Badge>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-auto max-w-[350px] max-h-[250px] overflow-y-auto p-2"
          >
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {references.length} referencia(s)
            </p>
            <div className="flex flex-wrap gap-1">
              {references.map((ref, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className={cn(
                    "font-mono text-xs px-2 py-0.5 cursor-default",
                    onReferenceClick && "cursor-pointer hover:bg-accent"
                  )}
                  onClick={onReferenceClick ? () => { onReferenceClick(ref); setPopoverOpen(false); } : undefined}
                >
                  {ref}
                </Badge>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

/**
 * Full references display for detail modals — all references listed.
 */
export function ReferencesFullList({
  references,
  onReferenceClick,
}: {
  references: string[];
  onReferenceClick?: (ref: string) => void;
}) {
  if (!references || references.length === 0) return null;

  return (
    <div className="space-y-1">
      <span className="text-muted-foreground text-xs">Referencias de Documentos</span>
      <div className="flex flex-wrap gap-1.5">
        {references.map((ref, i) => (
          <Badge
            key={i}
            variant="outline"
            className={cn(
              "font-mono text-xs px-2 py-0.5 gap-1",
              onReferenceClick && "cursor-pointer hover:bg-accent"
            )}
            onClick={onReferenceClick ? () => onReferenceClick(ref) : undefined}
          >
            <FileText className="h-3 w-3" />
            {ref}
          </Badge>
        ))}
      </div>
    </div>
  );
}

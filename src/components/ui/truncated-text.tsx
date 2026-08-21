import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TruncatedTextProps {
  text: string | null | undefined;
  /** Maximum characters before truncation (default 80; default 50 when expandable is true) */
  maxLength?: number;
  className?: string;
  /** If true, renders as inline span instead of block */
  inline?: boolean;
  /** If true, shows an inline expand/collapse toggle instead of a tooltip */
  expandable?: boolean;
}

/**
 * Displays text truncated to `maxLength` characters.
 * - Default mode: shows a tooltip with the full text on hover.
 * - Expandable mode: shows a "+ N más" / "Ver más" toggle that expands the text inline.
 * If text is within limit, renders normally without extra UI overhead.
 */
export function TruncatedText({
  text,
  maxLength,
  className,
  inline = false,
  expandable = false,
}: TruncatedTextProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const value = text ?? "";
  const limit = maxLength ?? (expandable ? 50 : 80);
  const needsTruncation = value.length > limit;
  const displayed = needsTruncation && !isExpanded
    ? value.slice(0, limit) + "…"
    : value;

  const Tag = inline ? "span" : "div";

  if (!needsTruncation) {
    return <Tag className={className}>{displayed}</Tag>;
  }

  if (expandable) {
    return (
      <Tag className={cn("break-words", className)}>
        {displayed}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded((prev) => !prev);
          }}
          className="ml-1 text-primary hover:underline text-[10px] align-baseline"
        >
          {isExpanded ? "Ver menos" : "Ver más"}
        </button>
      </Tag>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Tag className={cn("cursor-default", className)}>{displayed}</Tag>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-sm whitespace-pre-wrap break-words text-sm"
        >
          {value}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

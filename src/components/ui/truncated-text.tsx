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
  /** Maximum characters before truncation (default 80) */
  maxLength?: number;
  className?: string;
  /** If true, renders as inline span instead of block */
  inline?: boolean;
}

/**
 * Displays text truncated to `maxLength` characters with a tooltip showing the full text.
 * If text is within limit, renders normally without tooltip overhead.
 */
export function TruncatedText({
  text,
  maxLength = 80,
  className,
  inline = false,
}: TruncatedTextProps) {
  const value = text ?? "";
  const needsTruncation = value.length > maxLength;
  const displayed = needsTruncation
    ? value.slice(0, maxLength) + "…"
    : value;

  const Tag = inline ? "span" : "div";

  if (!needsTruncation) {
    return <Tag className={className}>{displayed}</Tag>;
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

import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink } from "lucide-react";

export type EntityType =
  | "journal_entry"
  | "account"
  | "purchase"
  | "bank_document"
  | "supplier";

export interface DateContext {
  dateFrom: string;
  dateTo: string;
}

interface EntityLinkProps {
  type: EntityType;
  /** The primary identifier to display (entry_number, account_code, etc.) */
  label: string;
  /** The numeric ID used for navigation / deep-linking */
  id?: number;
  /** Optional secondary label shown in tooltip */
  secondaryLabel?: string;
  /** Extra class names */
  className?: string;
  /** If true, render as plain text (no link behaviour) */
  disabled?: boolean;
  /** Temporal context derived from the source entry/period */
  dateContext?: DateContext;
}

function buildRoute(type: EntityType, id: number | undefined, dateContext?: DateContext): string {
  const dc = dateContext;
  switch (type) {
    case "journal_entry":
      return `/partidas?viewEntry=${id}`;
    case "account": {
      let url = `/mayor?accountId=${id}`;
      if (dc) url += `&startDate=${dc.dateFrom}&endDate=${dc.dateTo}`;
      return url;
    }
    case "purchase":
      return `/libros-fiscales`;
    case "bank_document": {
      let url = `/reportes?tab=bancos`;
      if (dc) url += `&dateFrom=${dc.dateFrom}&dateTo=${dc.dateTo}`;
      return url;
    }
    case "supplier":
      return `/libros-fiscales`;
  }
}

const ENTITY_TOOLTIPS: Record<EntityType, string> = {
  journal_entry: "Ver partida",
  account: "Ver mayor",
  purchase: "Ver en libro de compras",
  bank_document: "Ver en libro de bancos",
  supplier: "Ver proveedor",
};

/**
 * Reusable clickable deep-link for accounting entities.
 * Renders a styled inline link that navigates to the corresponding view.
 */
export default function EntityLink({
  type,
  label,
  id,
  secondaryLabel,
  className,
  disabled,
  dateContext,
}: EntityLinkProps) {
  const navigate = useNavigate();

  if (disabled || id == null) {
    return <span className={cn("font-mono text-xs", className)}>{label}</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const route = buildRoute(type, id, dateContext);
    if (e.ctrlKey || e.metaKey) {
      window.open(route, "_blank");
      return;
    }
    navigate(route);
  };

  const tooltipText = secondaryLabel
    ? `${ENTITY_TOOLTIPS[type]} · ${secondaryLabel}`
    : ENTITY_TOOLTIPS[type];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "inline-flex items-center gap-1 font-mono text-xs text-primary underline-offset-2 hover:underline cursor-pointer transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm px-0.5 -mx-0.5",
            className
          )}
        >
          {label}
          <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {tooltipText}
      </TooltipContent>
    </Tooltip>
  );
}

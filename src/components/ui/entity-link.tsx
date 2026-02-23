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
}

const ENTITY_ROUTES: Record<EntityType, (id?: number) => string> = {
  journal_entry: (id) => `/partidas?viewEntry=${id}`,
  account: (id) => `/mayor?accountId=${id}`,
  purchase: () => `/libros-fiscales`,
  bank_document: () => `/reportes?tab=bancos`,
  supplier: () => `/libros-fiscales`,
};

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
}: EntityLinkProps) {
  const navigate = useNavigate();

  if (disabled || id == null) {
    return <span className={cn("font-mono text-xs", className)}>{label}</span>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const route = ENTITY_ROUTES[type](id);
    // Allow Ctrl/Cmd + click to open in new tab
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

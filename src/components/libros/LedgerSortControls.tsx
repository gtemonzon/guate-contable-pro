import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp, Building2, Calendar, Coins } from "lucide-react";

export type LedgerSortField = "date" | "party" | "amount";
export type LedgerSortDir = "asc" | "desc";

interface Props {
  field: LedgerSortField | null;
  dir: LedgerSortDir;
  onSort: (field: LedgerSortField) => void;
  /** Label for the party column (e.g. "Proveedor" or "Cliente"). */
  partyLabel?: string;
}

/**
 * Compact icon-only sort buttons for Libros Fiscales (Compras / Ventas).
 * Active field is highlighted in sky/celeste and shows an ASC/DESC arrow.
 * Clicking the active field toggles ASC ↔ DESC.
 */
export function LedgerSortControls({ field, dir, onSort, partyLabel = "Proveedor" }: Props) {
  const items: { key: LedgerSortField; label: string; Icon: typeof Calendar }[] = [
    { key: "date", label: "Fecha", Icon: Calendar },
    { key: "party", label: partyLabel, Icon: Building2 },
    { key: "amount", label: "Monto", Icon: Coins },
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {items.map(({ key, label, Icon }) => {
          const active = field === key;
          const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
          const tooltip = `Ordenar por ${label} ${active && dir === "asc" ? "descendente" : "ascendente"}`;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className={
                    active
                      ? "h-7 px-2 bg-sky-100 hover:bg-sky-200 text-sky-700 border border-sky-300"
                      : "h-7 px-2"
                  }
                  onClick={() => onSort(key)}
                  title={tooltip}
                  aria-label={tooltip}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {active && <Arrow className="h-3 w-3 ml-0.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{tooltip}</p></TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

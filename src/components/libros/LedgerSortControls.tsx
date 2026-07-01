import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

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
 * Small, compact sort buttons for Libros Fiscales (Compras / Ventas).
 * Clicking the active field toggles ASC ↔ DESC.
 */
export function LedgerSortControls({ field, dir, onSort, partyLabel = "Proveedor" }: Props) {
  const items: { key: LedgerSortField; label: string }[] = [
    { key: "date", label: "Fecha" },
    { key: "party", label: partyLabel },
    { key: "amount", label: "Monto" },
  ];

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">Ordenar:</span>
      {items.map((it) => {
        const active = field === it.key;
        const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
        return (
          <Button
            key={it.key}
            type="button"
            size="sm"
            variant={active ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => onSort(it.key)}
            title={`Ordenar por ${it.label} ${active && dir === "asc" ? "descendente" : "ascendente"}`}
          >
            {it.label}
            <Icon className="h-3 w-3 ml-1" />
          </Button>
        );
      })}
    </div>
  );
}

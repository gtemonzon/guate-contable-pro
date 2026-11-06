import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { FinalizedImport } from "@/utils/purchaseImportTax";
import type { ImportListRow, ImportSelectionSummary } from "@/utils/purchaseImportSelection";
import { exemptionBadgeLabel, exemptionTooltip } from "@/utils/taxExemption";

/** Campos del registro que muestra la lista. */
export interface ImportRecordListItem {
  invoice_date: string;
  invoice_series?: string | null;
  invoice_number: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  expense_account_id?: number | null;
  operation_type_id?: number | null;
}

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Insignia de la porción exenta deducida del IVA del archivo SAT (caso e). */
export function DerivedExemptBadge<T extends Pick<ImportRecordListItem, "base_amount" | "vat_amount">>({
  finalized,
}: {
  finalized?: FinalizedImport<T>;
}) {
  if (finalized?.derivedExempt == null) return null;
  return (
    <Badge variant="outline" className="text-[9px] h-auto px-1 shrink-0 border-primary/40 text-primary" title="Exento deducido del IVA del archivo SAT">
      {Math.abs(finalized.record.base_amount) <= 0.005 && Math.abs(finalized.record.vat_amount) <= 0.005 ? "Exento" : "Exento parcial"}
    </Badge>
  );
}

type StatusFilter = "all" | "new" | "loaded";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "new", label: "Nuevas" },
  { value: "loaded", label: "Ya cargadas" },
];

interface ImportRecordListProps<T extends ImportRecordListItem> {
  rows: ImportListRow<T>[];
  summary: ImportSelectionSummary;
  selectedIndices: Set<number>;
  onToggle: (validIndex: number) => void;
  onSelectAllNew: () => void;
  onClearAll: () => void;
  search: string;
  onSearch: (value: string) => void;
  /** Cuenta y tipo de operación asignados (en el resumen). */
  showMappingBadges: boolean;
  taxReview: { validFinal: FinalizedImport<T>[] } | null;
  expenseAccounts: { id: number; account_code: string }[];
  operationTypes: { id: number; code: string }[];
}

const serieNumber = (r: Pick<ImportRecordListItem, "invoice_series" | "invoice_number">) =>
  `${r.invoice_series || ""}${r.invoice_series ? "-" : ""}${r.invoice_number}`;

/**
 * Lista de selección del importador de compras: facturas nuevas (seleccionables), ya
 * cargadas (marcadas y bloqueadas) y repetidas dentro del archivo.
 */
export function ImportRecordList<T extends ImportRecordListItem>({
  rows,
  summary,
  selectedIndices,
  onToggle,
  onSelectAllNew,
  onClearAll,
  search,
  onSearch,
  showMappingBadges,
  taxReview,
  expenseAccounts,
  operationTypes,
}: ImportRecordListProps<T>) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const q = search.toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (statusFilter === "new" && row.status !== "new") return false;
    if (statusFilter === "loaded" && row.status !== "loaded") return false;
    if (!q) return true;
    return row.record.supplier_name.toLowerCase().includes(q) || serieNumber(row.record).toLowerCase().includes(q);
  });

  return (
    <Collapsible defaultOpen={summary.loadedCount > 0}>
      <div className="border rounded-lg">
        <CollapsibleTrigger className="w-full px-4 py-2 border-b flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 text-left">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-sm font-medium">
              {summary.selectedCount} de {summary.newCount} nuevas seleccionadas
            </span>
            <span className="text-sm font-semibold font-mono text-primary">Q{formatCurrency(summary.selectedTotal)}</span>
            {summary.loadedCount > 0 && (
              <span className="text-xs text-muted-foreground">· {summary.loadedCount} ya cargadas</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform shrink-0" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 py-2 border-b bg-muted/30 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-md border overflow-hidden">
              {STATUS_FILTERS.map((f, i) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    "px-2 py-1 text-xs transition-colors",
                    i > 0 && "border-l",
                    statusFilter === f.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onSelectAllNew}>
                Seleccionar todas las nuevas
              </Button>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onClearAll}>
                Desmarcar todas
              </Button>
            </div>
          </div>
          {summary.loadedCount > 0 && (
            <p className="px-4 py-2 border-b text-xs text-muted-foreground">
              Ya cargadas: {summary.loadedCount} (marcadas y bloqueadas). Marca solo las facturas nuevas que quieras importar.
            </p>
          )}
          <div className="px-4 py-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por proveedor o serie-factura..."
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                className="w-full h-8 pl-7 pr-3 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="max-h-[250px] overflow-auto">
            <div className="divide-y">
              {visibleRows.map((row) => {
                const { record } = row;
                const isNew = row.status === "new" && row.validIndex !== undefined;
                const idx = row.validIndex ?? -1;
                const selected = isNew && selectedIndices.has(idx);
                const finalized = isNew ? taxReview?.validFinal[idx] : undefined;
                return (
                  <div
                    key={row.key}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2 text-xs transition-colors min-w-0",
                      isNew && "hover:bg-muted/30 cursor-pointer",
                      isNew && !selected && "opacity-50",
                      row.status === "loaded" && "text-muted-foreground"
                    )}
                    onClick={isNew ? () => onToggle(idx) : undefined}
                  >
                    <div className="w-4 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {isNew && <Checkbox checked={selected} onCheckedChange={() => onToggle(idx)} />}
                      {row.status === "loaded" && <Checkbox checked disabled aria-label="Ya cargada" />}
                    </div>
                    <span className="w-[78px] font-mono shrink-0">{record.invoice_date}</span>
                    <span className="w-[90px] text-right font-mono shrink-0">Q{formatCurrency(record.total_amount)}</span>
                    <span className="w-[100px] shrink-0 truncate font-mono" title={serieNumber(record)}>
                      {serieNumber(record)}
                    </span>
                    <span className="flex-1 min-w-0 truncate" title={record.supplier_name}>
                      {record.supplier_name}
                    </span>
                    {row.status === "loaded" && (
                      <Badge variant="secondary" className="text-[9px] h-auto px-1 shrink-0">Ya cargada</Badge>
                    )}
                    {row.status === "repeated" && (
                      <Badge variant="outline" className="text-[9px] h-auto px-1 shrink-0">Repetida en el archivo</Badge>
                    )}
                    {isNew && showMappingBadges && record.expense_account_id && (
                      <span className="text-[10px] text-primary/70 shrink-0" title="Cuenta asignada">
                        {expenseAccounts.find((a) => a.id === record.expense_account_id)?.account_code || ""}
                      </span>
                    )}
                    {isNew && showMappingBadges && record.operation_type_id && (
                      <Badge variant="secondary" className="text-[9px] h-3.5 px-1 shrink-0">
                        {operationTypes.find((o) => o.id === record.operation_type_id)?.code || ""}
                      </Badge>
                    )}
                    {isNew && <DerivedExemptBadge finalized={finalized} />}
                    {finalized?.exempted && (
                      <Badge
                        variant="outline"
                        className="text-[9px] h-3.5 px-1 shrink-0 border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
                        title={exemptionTooltip(finalized.exemption)}
                      >
                        {exemptionBadgeLabel(finalized.exemption)}
                      </Badge>
                    )}
                    {finalized?.warning && (
                      <span title={finalized.warning} className="shrink-0">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      </span>
                    )}
                  </div>
                );
              })}
              {visibleRows.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">Sin facturas para este filtro</p>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

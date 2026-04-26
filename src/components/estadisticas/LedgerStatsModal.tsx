import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart3,
  TrendingUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Crown,
  List,
  Loader2,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

type LedgerType = "compras" | "ventas";

interface LedgerStatsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: string;
  type: LedgerType;
}

interface StatRow {
  name: string;
  total: number;
  count: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function LedgerStatsModal({ open, onOpenChange, enterpriseId, type }: LedgerStatsModalProps) {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [data, setData] = useState<StatRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<"top10" | "full">("top10");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [sortField, setSortField] = useState<"total" | "name">("total");

  const label = type === "compras" ? "Proveedores" : "Clientes";
  const tableName = type === "compras" ? "tab_purchase_ledger" : "tab_sales_ledger";
  const nameField = type === "compras" ? "supplier_name" : "customer_name";
  const nitField = type === "compras" ? "supplier_nit" : "customer_nit";

  // Fetch available years
  useEffect(() => {
    if (!open || !enterpriseId) return;
    const fetchYears = async () => {
      const { data: rows } = await supabase
        .from(tableName)
        .select("invoice_date")
        .eq("enterprise_id", parseInt(enterpriseId))
        .order("invoice_date", { ascending: true });

      if (rows && rows.length > 0) {
        const years = [...new Set(rows.map((r: { invoice_date: string }) => new Date(r.invoice_date).getFullYear()))].sort((a, b) => b - a);
        setAvailableYears(years);
        if (selectedYears.length === 0) setSelectedYears(years.length > 0 ? [years[0]] : []);
      }
    };
    fetchYears();
  }, [open, enterpriseId, tableName]);

  // Fetch stats when filters change
  useEffect(() => {
    if (!open || !enterpriseId || selectedYears.length === 0) return;
    const fetchStats = async () => {
      setLoading(true);
      try {
        let allRows: any[] = [];

        for (const year of selectedYears) {
          const months = selectedMonths.length > 0 ? selectedMonths : Array.from({ length: 12 }, (_, i) => i + 1);
          for (const month of months) {
            const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
            const endDate = new Date(year, month, 0).toISOString().split("T")[0];

            let query: any = supabase
              .from(tableName)
              .select(`${nitField}, ${nameField}, total_amount, invoice_date`)
              .eq("enterprise_id", parseInt(enterpriseId))
              .gte("invoice_date", startDate)
              .lte("invoice_date", endDate);

            if (type === "ventas") {
              query = query.eq("is_annulled", false);
            }

            const rows = await fetchAllRecords<any>(query);
            allRows = allRows.concat(rows);
          }
        }

        // Aggregate by NIT, use most recent name
        const map = new Map<string, { total: number; count: number; name: string; lastDate: string }>();
        for (const row of allRows) {
          const nit = (row[nitField] || "").toUpperCase().trim();
          const name = (row[nameField] || "").toUpperCase().trim();
          if (!nit || nit === "ANULADA" || !name || name === "ANULADA") continue;
          const existing = map.get(nit) || { total: 0, count: 0, name, lastDate: "" };
          existing.total += Number(row.total_amount) || 0;
          existing.count += 1;
          // Keep the name from the most recent invoice
          const invoiceDate = row.invoice_date || "";
          if (invoiceDate >= existing.lastDate) {
            existing.name = name;
            existing.lastDate = invoiceDate;
          }
          map.set(nit, existing);
        }

        const result: StatRow[] = Array.from(map.values()).map((v) => ({
          name: v.name,
          total: v.total,
          count: v.count,
        }));

        setData(result);
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [open, enterpriseId, selectedYears, selectedMonths, tableName, nameField, type]);

  const sortedData = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      if (sortField === "total") {
        return sortDir === "desc" ? b.total - a.total : a.total - b.total;
      }
      return sortDir === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
    });
    return viewMode === "top10" ? sorted.slice(0, 10) : sorted;
  }, [data, sortDir, sortField, viewMode]);

  const maxTotal = useMemo(() => Math.max(...sortedData.map((d) => d.total), 1), [sortedData]);

  const toggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  const toggleAllYears = () => {
    setSelectedYears((prev) =>
      prev.length === availableYears.length ? [] : [...availableYears]
    );
  };

  const toggleMonth = (month: number) => {
    setSelectedMonths((prev) =>
      prev.includes(month) ? prev.filter((m) => m !== month) : [...prev, month]
    );
  };

  const toggleAllMonths = () => {
    setSelectedMonths((prev) =>
      prev.length === 12 ? [] : Array.from({ length: 12 }, (_, i) => i + 1)
    );
  };

  const yearLabel =
    selectedYears.length === availableYears.length
      ? "Todos los años"
      : selectedYears.length === 0
        ? "Seleccionar..."
        : selectedYears.sort((a, b) => b - a).join(", ");

  const monthLabel =
    selectedMonths.length === 0 || selectedMonths.length === 12
      ? "Todo el año"
      : selectedMonths.sort((a, b) => a - b).map((m) => MONTHS[m - 1].substring(0, 3)).join(", ");

  const grandTotal = useMemo(() => data.reduce((s, d) => s + d.total, 0), [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden border-primary/20">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 pb-4 border-b">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-primary" />
              Estadísticas de {label}
            </DialogTitle>
          </DialogHeader>

          {/* Filters row */}
          <div className="flex flex-wrap gap-2 mt-4">
            {/* Year selector */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  📅 {yearLabel}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-accent text-sm font-medium"
                  onClick={toggleAllYears}
                >
                  <Checkbox checked={selectedYears.length === availableYears.length} />
                  Todos los años
                </div>
                <div className="border-t my-1" />
                {availableYears.map((y) => (
                  <div
                    key={y}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-accent text-sm"
                    onClick={() => toggleYear(y)}
                  >
                    <Checkbox checked={selectedYears.includes(y)} />
                    {y}
                  </div>
                ))}
              </PopoverContent>
            </Popover>

            {/* Month selector — only when single year or explicitly wanted */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  🗓️ {monthLabel}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div
                  className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-accent text-sm font-medium"
                  onClick={toggleAllMonths}
                >
                  <Checkbox checked={selectedMonths.length === 0 || selectedMonths.length === 12} />
                  Todo el año
                </div>
                <div className="border-t my-1" />
                <ScrollArea className="max-h-48">
                  {MONTHS.map((name, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded hover:bg-accent text-sm"
                      onClick={() => toggleMonth(idx + 1)}
                    >
                      <Checkbox checked={selectedMonths.includes(idx + 1)} />
                      {name}
                    </div>
                  ))}
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {/* View toggle */}
            <div className="flex ml-auto gap-1">
              <Button
                variant={viewMode === "top10" ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setViewMode("top10")}
              >
                <Crown className="h-3 w-3" />
                Top 10
              </Button>
              <Button
                variant={viewMode === "full" ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setViewMode("full")}
              >
                <List className="h-3 w-3" />
                Completa
              </Button>
            </div>
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-4 px-6 py-2.5 bg-muted/50 text-xs border-b">
          <span className="font-medium text-muted-foreground">
            {data.length} {label.toLowerCase()} encontrados
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="font-semibold">
            Total: Q {formatCurrency(grandTotal)}
          </span>
          <span className="ml-auto flex gap-1">
            <Button
              variant={sortField === "name" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => {
                if (sortField === "name") setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                else { setSortField("name"); setSortDir("asc"); }
              }}
            >
              {sortField === "name" ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3" />}
              Nombre
            </Button>
            <Button
              variant={sortField === "total" ? "secondary" : "ghost"}
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={() => {
                if (sortField === "total") setSortDir((d) => (d === "desc" ? "asc" : "desc"));
                else { setSortField("total"); setSortDir("desc"); }
              }}
            >
              {sortField === "total" ? (sortDir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3" />}
              Monto
            </Button>
          </span>
        </div>

        {/* Data list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 space-y-1.5">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Cargando estadísticas...
              </div>
            ) : sortedData.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                No hay datos para el período seleccionado
              </div>
            ) : (
              sortedData.map((row, idx) => {
                const pct = (row.total / maxTotal) * 100;
                const isTop3 = viewMode === "top10" && idx < 3;
                return (
                  <div
                    key={row.name}
                    className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    {/* Rank */}
                    <div className="flex-shrink-0 w-7 text-center">
                      {isTop3 ? (
                        <span className={`text-sm font-bold ${idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : "text-amber-700"}`}>
                          {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground font-mono">{idx + 1}</span>
                      )}
                    </div>

                    {/* Name + bar */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${isTop3 ? "font-semibold" : ""}`}>
                          {row.name}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                            {row.count} doc{row.count !== 1 ? "s" : ""}
                          </Badge>
                          <span className="text-sm font-mono font-semibold tabular-nums whitespace-nowrap">
                            Q {formatCurrency(row.total)}
                          </span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FileSpreadsheet, FileText, Loader2, ChevronRight, ChevronDown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import AccountLedgerDrawer from "./AccountLedgerDrawer";

interface AccountBalance {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  level: number;
  parent_account_id: number | null;
  balance: number;
}

interface VariationLine {
  id: number;
  code: string;
  name: string;
  level: number;
  parentId: number | null;
  hasChildren: boolean;
  currentBalance: number;
  comparedBalance: number;
  variationAmount: number;
  variationPercent: number | null; // null when compared is 0
}

type CompareOption = "prev_month" | "prev_quarter" | "prev_year" | "same_month_last_year" | "fiscal_start" | "custom";

function computeCompareDate(baseDate: string, option: CompareOption): string {
  const d = new Date(baseDate + "T00:00:00");
  switch (option) {
    case "prev_month":
      d.setMonth(d.getMonth() - 1);
      break;
    case "prev_quarter":
      d.setMonth(d.getMonth() - 3);
      break;
    case "prev_year":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "same_month_last_year":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "fiscal_start": {
      // Beginning of fiscal year (Jan 1 of same year)
      return `${d.getFullYear()}-01-01`;
    }
    case "custom":
      return baseDate; // handled externally
  }
  return d.toISOString().split("T")[0];
}

export default function ReporteVariaciones() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState("");
  const [baseDate, setBaseDate] = useState("");
  const [compareOption, setCompareOption] = useState<CompareOption>("prev_month");
  const [customDate, setCustomDate] = useState("");
  const [displayLevel, setDisplayLevel] = useState(0);
  const [rootAccountId, setRootAccountId] = useState<string>("all");
  const [rootAccounts, setRootAccounts] = useState<{ id: number; code: string; name: string }[]>([]);
  const [lines, setLines] = useState<VariationLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [filterSignificant, setFilterSignificant] = useState(false);
  const [threshold, setThreshold] = useState("5");
  const [drawerAccount, setDrawerAccount] = useState<{ id: number; code: string; name: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const eid = localStorage.getItem("currentEnterpriseId");
    if (eid) {
      setEnterpriseId(parseInt(eid));
      fetchEnterpriseName(eid);
      fetchRootAccounts(parseInt(eid));
    }
    setBaseDate(new Date().toISOString().split("T")[0]);
  }, []);

  const fetchEnterpriseName = async (eid: string) => {
    const { data } = await supabase.from("tab_enterprises").select("business_name").eq("id", parseInt(eid)).single();
    if (data) setEnterpriseName(data.business_name || "");
  };

  const fetchRootAccounts = async (eid: number) => {
    const { data } = await supabase
      .from("tab_accounts")
      .select("id, account_code, account_name")
      .eq("enterprise_id", eid)
      .eq("level", 1)
      .is("deleted_at", null)
      .order("account_code");
    if (data) setRootAccounts(data.map(a => ({ id: a.id, code: a.account_code, name: a.account_name })));
  };

  const generateReport = async () => {
    if (!enterpriseId || !baseDate) {
      toast({ title: "Error", description: "Selecciona empresa y fecha", variant: "destructive" });
      return;
    }

    const compareDate = compareOption === "custom" ? customDate : computeCompareDate(baseDate, compareOption);
    if (!compareDate) {
      toast({ title: "Error", description: "Selecciona la fecha de comparación", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      const [currentRes, comparedRes] = await Promise.all([
        supabase.rpc("get_balance_sheet", { p_enterprise_id: enterpriseId, p_as_of_date: baseDate }),
        supabase.rpc("get_balance_sheet", { p_enterprise_id: enterpriseId, p_as_of_date: compareDate }),
      ]);

      if (currentRes.error) throw currentRes.error;
      if (comparedRes.error) throw comparedRes.error;

      const toMap = (rows: any[]): Map<number, AccountBalance> => {
        const m = new Map<number, AccountBalance>();
        for (const r of rows) {
          m.set(Number(r.account_id), {
            id: Number(r.account_id),
            account_code: r.account_code,
            account_name: r.account_name,
            account_type: r.account_type,
            level: r.level,
            parent_account_id: r.parent_account_id ? Number(r.parent_account_id) : null,
            balance: Number(r.balance),
          });
        }
        return m;
      };

      const currentMap = toMap(currentRes.data || []);
      const comparedMap = toMap(comparedRes.data || []);

      // Merge all account IDs
      const allIds = new Set([...currentMap.keys(), ...comparedMap.keys()]);
      const allAccounts: AccountBalance[] = [];
      for (const id of allIds) {
        const cur = currentMap.get(id);
        const cmp = comparedMap.get(id);
        allAccounts.push(cur || cmp!);
      }

      // Build children map
      const childrenByParent = new Map<number, AccountBalance[]>();
      for (const acc of allAccounts) {
        if (acc.parent_account_id != null) {
          const list = childrenByParent.get(acc.parent_account_id) || [];
          list.push(acc);
          childrenByParent.set(acc.parent_account_id, list);
        }
      }

      // Aggregated balance
      const aggCache = new Map<number, { cur: number; cmp: number }>();
      const getAgg = (accId: number): { cur: number; cmp: number } => {
        const cached = aggCache.get(accId);
        if (cached) return cached;
        const curBal = currentMap.get(accId)?.balance || 0;
        const cmpBal = comparedMap.get(accId)?.balance || 0;
        const children = childrenByParent.get(accId) || [];
        let totalCur = curBal;
        let totalCmp = cmpBal;
        for (const c of children) {
          const child = getAgg(c.id);
          totalCur += child.cur;
          totalCmp += child.cmp;
        }
        const result = { cur: totalCur, cmp: totalCmp };
        aggCache.set(accId, result);
        return result;
      };

      // Build flat tree
      const result: VariationLine[] = [];
      const pushTree = (acc: AccountBalance) => {
        const children = (childrenByParent.get(acc.id) || []).slice().sort((a, b) => a.account_code.localeCompare(b.account_code));
        const agg = getAgg(acc.id);
        const variation = agg.cur - agg.cmp;
        const pct = Math.abs(agg.cmp) > 0.001 ? (variation / Math.abs(agg.cmp)) * 100 : null;

        result.push({
          id: acc.id,
          code: acc.account_code,
          name: acc.account_name,
          level: acc.level,
          parentId: acc.parent_account_id,
          hasChildren: children.length > 0,
          currentBalance: agg.cur,
          comparedBalance: agg.cmp,
          variationAmount: variation,
          variationPercent: pct,
        });

        for (const child of children) {
          pushTree(child);
        }
      };

      // Determine roots
      let roots = allAccounts
        .filter(a => a.parent_account_id == null)
        .sort((a, b) => a.account_code.localeCompare(b.account_code));

      if (rootAccountId !== "all") {
        const rid = parseInt(rootAccountId);
        const rootAcc = allAccounts.find(a => a.id === rid);
        if (rootAcc) roots = [rootAcc];
      }

      for (const root of roots) {
        pushTree(root);
      }

      setLines(result);

      // Default expand level 1
      const defaultExp = new Set<number>();
      for (const l of result) {
        if (l.level === 1 && l.hasChildren) defaultExp.add(l.id);
      }
      setExpanded(defaultExp);

      if (result.length === 0) {
        toast({ title: "Sin datos", description: "No hay cuentas con movimientos para las fechas seleccionadas" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Filtered lines
  const filteredLines = useMemo(() => {
    let filtered = lines;

    // Level filter
    if (displayLevel > 0) {
      filtered = filtered.filter(l => l.level <= displayLevel);
    }

    // Significance filter
    if (filterSignificant) {
      const t = parseFloat(threshold);
      filtered = filtered.filter(l => {
        if (!l.hasChildren && l.variationPercent !== null && Math.abs(l.variationPercent) < t) return false;
        return true;
      });
    }

    return filtered;
  }, [lines, displayLevel, filterSignificant, threshold]);

  // Visible lines (expansion)
  const visibleLines = useMemo(() => {
    const result: VariationLine[] = [];
    const ancestorStack: { id: number; expanded: boolean }[] = [];

    for (const line of filteredLines) {
      const level = line.level;
      while (ancestorStack.length > 0 && ancestorStack.length >= level) {
        ancestorStack.pop();
      }
      const hidden = ancestorStack.some(a => !a.expanded);
      if (!hidden) result.push(line);
      if (line.hasChildren) {
        ancestorStack.push({ id: line.id, expanded: expanded.has(line.id) });
      }
    }
    return result;
  }, [filteredLines, expanded]);

  const compareDateLabel = useMemo(() => {
    if (!baseDate) return "";
    if (compareOption === "custom") return customDate || "";
    return computeCompareDate(baseDate, compareOption);
  }, [baseDate, compareOption, customDate]);

  const fmtQ = (n: number) => `Q ${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPct = (n: number | null) => (n === null ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

  const getVariationColor = (amount: number) => {
    if (Math.abs(amount) < 0.01) return "text-muted-foreground";
    return amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  };

  const getVariationIcon = (amount: number) => {
    if (Math.abs(amount) < 0.01) return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
    return amount > 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <TrendingDown className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />;
  };

  const handleExportExcel = () => {
    const headers = ["Cuenta", "Saldo Actual", "Saldo Comparado", "Variación", "Variación %"];
    const data = visibleLines.map(l => [
      `${"  ".repeat(l.level - 1)}${l.code} - ${l.name}`,
      l.currentBalance.toFixed(2),
      l.comparedBalance.toFixed(2),
      l.variationAmount.toFixed(2),
      l.variationPercent !== null ? `${l.variationPercent.toFixed(1)}%` : "N/A",
    ]);
    exportToExcel({
      filename: `Variaciones_${baseDate}`,
      title: `Análisis de Variaciones al ${new Date(baseDate + "T00:00:00").toLocaleDateString("es-GT")}`,
      enterpriseName,
      headers,
      data,
    });
    toast({ title: "Exportado", description: "Reporte exportado a Excel" });
  };

  const handleExportPDF = () => {
    const headers = ["Cuenta", "Saldo Actual", "Saldo Comparado", "Variación", "Var %"];
    const data = visibleLines.map(l => [
      `${"  ".repeat(l.level - 1)}${l.code} - ${l.name}`,
      fmtQ(l.currentBalance),
      fmtQ(l.comparedBalance),
      fmtQ(l.variationAmount),
      fmtPct(l.variationPercent),
    ]);
    exportToPDF({
      filename: `Variaciones_${baseDate}`,
      title: `Análisis de Variaciones al ${new Date(baseDate + "T00:00:00").toLocaleDateString("es-GT")}`,
      enterpriseName,
      headers,
      data,
      forcePortrait: false,
    });
    toast({ title: "Exportado", description: "Reporte exportado a PDF" });
  };

  const handleAccountClick = (line: VariationLine) => {
    if (line.hasChildren) return;
    setDrawerAccount({ id: line.id, code: line.code, name: line.name });
  };

  return (
    <div className="space-y-6">
      {/* Controls Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <Label>Fecha Base</Label>
          <Input type="date" value={baseDate} onChange={e => setBaseDate(e.target.value)} />
        </div>

        <div>
          <Label>Comparar contra</Label>
          <Select value={compareOption} onValueChange={v => setCompareOption(v as CompareOption)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prev_month">Mes anterior</SelectItem>
              <SelectItem value="prev_quarter">Trimestre anterior</SelectItem>
              <SelectItem value="prev_year">Año anterior</SelectItem>
              <SelectItem value="same_month_last_year">Mismo mes año anterior</SelectItem>
              <SelectItem value="fiscal_start">Inicio período fiscal</SelectItem>
              <SelectItem value="custom">Fecha personalizada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {compareOption === "custom" && (
          <div>
            <Label>Fecha de comparación</Label>
            <Input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)} />
          </div>
        )}

        <div>
          <Label>Nivel de Detalle</Label>
          <Select value={displayLevel.toString()} onValueChange={v => setDisplayLevel(parseInt(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Todos los niveles</SelectItem>
              <SelectItem value="1">Nivel 1</SelectItem>
              <SelectItem value="2">Nivel 2</SelectItem>
              <SelectItem value="3">Nivel 3</SelectItem>
              <SelectItem value="4">Nivel 4</SelectItem>
              <SelectItem value="5">Nivel 5</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Filtro de cuenta</Label>
          <Select value={rootAccountId} onValueChange={setRootAccountId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las cuentas</SelectItem>
              {rootAccounts.map(a => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.code} - {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Controls Row 2 */}
      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch checked={filterSignificant} onCheckedChange={setFilterSignificant} id="sig-filter" />
          <Label htmlFor="sig-filter" className="text-sm">Solo cambios significativos</Label>
        </div>

        {filterSignificant && (
          <div className="w-28">
            <Label>Umbral</Label>
            <Select value={threshold} onValueChange={setThreshold}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1%</SelectItem>
                <SelectItem value="5">5%</SelectItem>
                <SelectItem value="10">10%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <Button onClick={generateReport} disabled={loading} className="ml-auto">
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Generar Análisis
        </Button>

        {lines.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <FileText className="h-4 w-4 mr-2" /> PDF
            </Button>
          </div>
        )}
      </div>

      {/* Report Table */}
      {visibleLines.length > 0 && (
        <div className="rounded-lg border p-4 bg-card">
          <div className="text-center mb-4">
            <h3 className="font-bold text-lg">{enterpriseName}</h3>
            <p className="text-sm text-muted-foreground">
              Análisis de Variaciones al {new Date(baseDate + "T00:00:00").toLocaleDateString("es-GT")}
              {compareDateLabel && ` vs ${new Date(compareDateLabel + "T00:00:00").toLocaleDateString("es-GT")}`}
            </p>
          </div>

          {/* Header */}
          <div className="grid grid-cols-[1fr_repeat(4,_auto)] gap-2 py-2 border-b border-border font-semibold text-xs text-muted-foreground">
            <div>Cuenta</div>
            <div className="text-right w-28">Saldo Actual</div>
            <div className="text-right w-28">Saldo Comparado</div>
            <div className="text-right w-28">Variación</div>
            <div className="text-right w-20">Var %</div>
          </div>

          {/* Rows */}
          <div className="font-mono text-sm">
            {visibleLines.map(line => {
              const isLeaf = !line.hasChildren;
              const isClickable = isLeaf;
              const isExpanded = line.hasChildren ? expanded.has(line.id) : false;

              return (
                <div
                  key={line.id}
                  className={[
                    "grid grid-cols-[1fr_repeat(4,_auto)] gap-2 py-1.5 items-center",
                    isClickable ? "cursor-pointer hover:bg-accent/40 transition-colors rounded" : "",
                    line.hasChildren ? "cursor-pointer font-semibold" : "",
                  ].join(" ")}
                  style={{ paddingLeft: `${Math.min(52, (line.level - 1) * 16 + 4)}px` }}
                  onClick={() => {
                    if (line.hasChildren) toggleExpand(line.id);
                    else handleAccountClick(line);
                  }}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-4 h-4 flex items-center justify-center shrink-0">
                      {line.hasChildren ? (
                        isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                      )}
                    </span>
                    <span className={`truncate ${isClickable ? "text-primary hover:underline" : ""}`}>
                      {line.code} - {line.name}
                    </span>
                  </div>
                  <div className="text-right w-28 whitespace-nowrap">{fmtQ(line.currentBalance)}</div>
                  <div className="text-right w-28 whitespace-nowrap">{fmtQ(line.comparedBalance)}</div>
                  <div className={`text-right w-28 whitespace-nowrap flex items-center justify-end gap-1 ${getVariationColor(line.variationAmount)}`}>
                    {getVariationIcon(line.variationAmount)}
                    {fmtQ(line.variationAmount)}
                  </div>
                  <div className={`text-right w-20 whitespace-nowrap ${getVariationColor(line.variationAmount)}`}>
                    {fmtPct(line.variationPercent)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AccountLedgerDrawer
        open={drawerAccount !== null}
        onOpenChange={o => { if (!o) setDrawerAccount(null); }}
        accountId={drawerAccount?.id ?? null}
        accountCode={drawerAccount?.code ?? ""}
        accountName={drawerAccount?.name ?? ""}
        enterpriseId={enterpriseId}
        endDate={baseDate}
      />
    </div>
  );
}

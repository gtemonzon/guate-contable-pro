/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileSpreadsheet, Download, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF, estimatePdfPageCount } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useFinancialStatementFormat, Section } from "@/hooks/useFinancialStatementFormat";
import { useEnterpriseConfig } from "@/hooks/useEnterpriseConfig";
import { useBookAuthorizations } from "@/hooks/useBookAuthorizations";
import ReportLayoutToggle, { type ReportLayout } from "./ReportLayoutToggle";
import ColumnarReportView, { toColumnarExcelData } from "./ColumnarReportView";
import SteppedReportView, { toSteppedExcelData } from "./SteppedReportView";
import HierarchicalReportView from "./HierarchicalReportView";
import AccountLedgerDrawer from "./AccountLedgerDrawer";
import { FolioExportDialog, FolioExportOptions } from "./FolioExportDialog";
import type { ReportLine } from "./reportTypes";
import { collectDescendantIds } from "./collectDescendantIds";
import { useReportTreeState } from "./useReportTreeState";

interface CdvBreakdown {
  initialInventory: number;
  purchases: number;
  availableForSale: number;
  finalInventory: number;
  costOfSales: number;
}

interface AccountBalance {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  level: number;
  parent_account_id: number | null;
  balance: number;
}

export default function ReporteEstadoResultados() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reportLines, setReportLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayLevel, setDisplayLevel] = useState<number>(0);
  const [cdvBreakdown, setCdvBreakdown] = useState<CdvBreakdown | null>(null);
  const [layout, setLayout] = useState<ReportLayout>('hierarchical');
  const [drawerAccount, setDrawerAccount] = useState<{ id: number; code: string; name: string; ids?: number[] } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const { toast } = useToast();

  const { config } = useEnterpriseConfig(currentEnterpriseId);
  const { consumePages } = useBookAuthorizations(currentEnterpriseId);

  const { format, loading: formatLoading } = useFinancialStatementFormat(
    currentEnterpriseId,
    'estado_resultados'
  );

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (enterpriseId) {
      setCurrentEnterpriseId(parseInt(enterpriseId));
      fetchEnterpriseName(enterpriseId);
    }

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateFrom(firstDay.toISOString().split('T')[0]);
    setDateTo(lastDay.toISOString().split('T')[0]);
  }, []);

  const fetchEnterpriseName = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_enterprises")
        .select("business_name")
        .eq("id", parseInt(enterpriseId))
        .single();

      if (error) throw error;
      setEnterpriseName(data?.business_name || "");
    } catch (error: unknown) {
      console.error("Error fetching enterprise:", error);
    }
  };

  // Get all child account IDs recursively
  const getAllChildAccountIds = (parentId: number, allAccounts: AccountBalance[]): number[] => {
    const children = allAccounts.filter(a => a.parent_account_id === parentId);
    let ids: number[] = [];
    for (const child of children) {
      ids.push(child.id);
      ids = ids.concat(getAllChildAccountIds(child.id, allAccounts));
    }
    return ids;
  };

  const generateReport = async () => {
    if (!currentEnterpriseId) {
      toast({
        title: "Error",
        description: "Selecciona una empresa primero",
        variant: "destructive",
      });
      return;
    }

    if (!dateFrom || !dateTo) {
      toast({
        title: "Error",
        description: "Debes seleccionar un período de fechas",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Use server-side RPC — aggregation happens in Postgres, not the client
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_pnl', {
        p_enterprise_id: currentEnterpriseId,
        p_start_date: dateFrom,
        p_end_date: dateTo,
      });

      if (rpcError) throw rpcError;

      const accountBalances: AccountBalance[] = (rpcData || []).map((row: any) => ({
        id: Number(row.account_id),
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        level: row.level,
        parent_account_id: row.parent_account_id ? Number(row.parent_account_id) : null,
        balance: Number(row.balance),
      }));

      // Load CDV breakdown if method is coeficiente
      let loadedCdv: CdvBreakdown | null = null;
      if (config?.cost_of_sales_method === 'coeficiente') {
        // Find accounting periods that overlap with the date range
        const { data: periods } = await supabase
          .from('tab_accounting_periods')
          .select('id')
          .eq('enterprise_id', currentEnterpriseId)
          .lte('start_date', dateTo)
          .gte('end_date', dateFrom);

        if (periods && periods.length > 0) {
          const periodIds = periods.map(p => p.id);
          const { data: closings } = await supabase
            .from('tab_period_inventory_closing')
            .select('*')
            .eq('enterprise_id', currentEnterpriseId)
            .eq('status', 'contabilizado')
            .in('accounting_period_id', periodIds);

          if (closings && closings.length > 0) {
            // Aggregate across all matching periods
            const totals = closings.reduce((acc, c) => ({
              initialInventory: acc.initialInventory + Number(c.initial_inventory_amount || 0),
              purchases: acc.purchases + Number(c.purchases_amount || 0),
              finalInventory: acc.finalInventory + Number(c.final_inventory_amount || 0),
              costOfSales: acc.costOfSales + Number(c.cost_of_sales_amount || 0),
            }), { initialInventory: 0, purchases: 0, finalInventory: 0, costOfSales: 0 });

            loadedCdv = {
              ...totals,
              availableForSale: totals.initialInventory + totals.purchases,
            };
          }
        }
      }
      setCdvBreakdown(loadedCdv);

      // If we have a configured format, use it
      if (format && format.sections.length > 0) {
        const lines = generateFormattedReport(format.sections, accountBalances);
        setReportLines(lines);
      } else {
        // Fallback to simple list of accounts with movements
        const simpleLines: ReportLine[] = accountBalances
          .filter(a => ['ingreso', 'gasto', 'costo'].includes(a.account_type) && a.balance !== 0)
          .map(a => ({
            type: 'account' as const,
            label: `${a.account_code} - ${a.account_name}`,
            amount: a.balance,
            level: a.level,
            accountId: a.id,
            accountCode: a.account_code,
          }));
        setReportLines(simpleLines);
      }

      if (reportLines.length === 0 && !format) {
        toast({
          title: "Sin datos",
          description: "No hay movimientos de ingresos o gastos en el período",
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Error al generar reporte",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateFormattedReport = (sections: Section[], accountBalances: AccountBalance[]): ReportLine[] => {
    const lines: ReportLine[] = [];
    const sectionTotals: Map<string, number> = new Map();

    // Build children index for roll-up calculations
    const childrenByParent = new Map<number, AccountBalance[]>();
    for (const acc of accountBalances) {
      if (acc.parent_account_id == null) continue;
      const list = childrenByParent.get(acc.parent_account_id) || [];
      list.push(acc);
      childrenByParent.set(acc.parent_account_id, list);
    }

    const aggCache = new Map<number, number>();
    const getAggregatedBalance = (accId: number): number => {
      const cached = aggCache.get(accId);
      if (cached !== undefined) return cached;

      const acc = accountBalances.find(a => a.id === accId);
      if (!acc) return 0;

      const children = childrenByParent.get(accId) || [];
      const total = acc.balance + children.reduce((sum, c) => sum + getAggregatedBalance(c.id), 0);
      aggCache.set(accId, total);
      return total;
    };

    const pushAccountTree = (root: AccountBalance, signMultiplier: number, depth: number, parentId?: number | null) => {
      const amount = getAggregatedBalance(root.id) * signMultiplier;
      const children = (childrenByParent.get(root.id) || []).slice().sort((a, b) => a.account_code.localeCompare(b.account_code));
      lines.push({
        type: "account",
        label: `${root.account_code} - ${root.account_name}`,
        amount,
        level: depth,
        accountLevel: root.level,
        accountId: root.id,
        accountCode: root.account_code,
        parentAccountId: parentId ?? null,
        hasChildren: children.length > 0,
      });

      for (const child of children) {
        pushAccountTree(child, signMultiplier, depth + 1, root.id);
      }
    };

    for (const section of sections) {
      if (!section.show_in_report) continue;

      if (section.section_type === "group") {
        // Section header
        lines.push({
          type: "section",
          label: section.section_name,
          amount: 0,
          isBold: true,
        });

        let sectionTotal = 0;

        for (const sectionAccount of section.accounts) {
          const account = accountBalances.find(a => a.id === sectionAccount.account_id);
          if (!account) continue;

          if (sectionAccount.include_children) {
            sectionTotal += getAggregatedBalance(account.id) * sectionAccount.sign_multiplier;
            pushAccountTree(account, sectionAccount.sign_multiplier, 1);
          } else {
            const amount = account.balance * sectionAccount.sign_multiplier;
            sectionTotal += amount;
            lines.push({
              type: "account",
              label: `${account.account_code} - ${account.account_name}`,
              amount,
              level: 1,
              accountLevel: account.level,
              accountId: account.id,
              accountCode: account.account_code,
            });
          }
        }

        sectionTotals.set(section.section_name, sectionTotal);
      } else if (section.section_type === "subtotal") {
        // Sum all previous group sections until another subtotal or total
        let subtotal = 0;
        for (let i = sections.indexOf(section) - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === "subtotal" || prevSection.section_type === "total") {
            break;
          }
          if (prevSection.section_type === "group") {
            subtotal += sectionTotals.get(prevSection.section_name) || 0;
          }
        }
        sectionTotals.set(section.section_name, subtotal);

        lines.push({
          type: "subtotal",
          label: section.section_name,
          amount: subtotal,
          isBold: true,
          showLine: true,
        });
      } else if (section.section_type === "total") {
        // For Estado de Resultados, the "total" should take the last calculated/subtotal value
        // and add any groups that appear after it (like OTROS INGRESOS Y GASTOS)
        let total = 0;
        let foundLastCalculatedOrSubtotal = false;
        
        // Find the most recent calculated or subtotal value before this total
        for (let i = sections.indexOf(section) - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === "total") {
            break;
          }
          
          // If we haven't found a calculated/subtotal yet, look for groups to add
          if (!foundLastCalculatedOrSubtotal) {
            if (prevSection.section_type === "calculated" || prevSection.section_type === "subtotal") {
              total = sectionTotals.get(prevSection.section_name) || 0;
              foundLastCalculatedOrSubtotal = true;
            } else if (prevSection.section_type === "group") {
              // Add groups that appear after the last calculated (like OTROS INGRESOS Y GASTOS)
              const groupVal = sectionTotals.get(prevSection.section_name) || 0;
              const sectionNameLower = prevSection.section_name.toLowerCase();
              // For "otros ingresos y gastos" sections, add positive for income, subtract for expense
              if (sectionNameLower.includes("otros") && (sectionNameLower.includes("ingreso") || sectionNameLower.includes("gasto"))) {
                total += groupVal; // Net effect (ingresos - gastos already in the group value)
              }
            }
          }
        }
        
        sectionTotals.set(section.section_name, total);

        lines.push({
          type: "total",
          label: section.section_name,
          amount: total,
          isBold: true,
          showLine: true,
        });
      } else if (section.section_type === "calculated") {
        // Calculate based on all groups before this calculated section, 
        // starting from the previous calculated/subtotal/total
        let calculated = 0;
        const currentIndex = sections.indexOf(section);
        
        // Find starting point: look back for previous calculated, subtotal or total
        let startFrom = 0;
        let baseValue = 0;
        for (let i = currentIndex - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === "calculated" || 
              prevSection.section_type === "subtotal" || 
              prevSection.section_type === "total") {
            startFrom = i + 1;
            baseValue = sectionTotals.get(prevSection.section_name) || 0;
            break;
          }
        }
        
        // Sum groups between startFrom and current section
        for (let i = startFrom; i < currentIndex; i++) {
          const s = sections[i];
          if (s.section_type !== "group") continue;
          const sectionVal = sectionTotals.get(s.section_name) || 0;
          const sectionNameLower = s.section_name.toLowerCase();
          
          // Income sections add, expense/cost sections subtract
          if (sectionNameLower.includes("ingreso") || sectionNameLower.includes("venta")) {
            calculated += sectionVal;
          } else if (sectionNameLower.includes("gasto") || sectionNameLower.includes("costo")) {
            calculated -= sectionVal;
          } else {
            // For generic sections (like "OTROS"), treat them as net additions
            calculated += sectionVal;
          }
        }
        
        // If we have a base value from a previous calculated, add it
        // This allows chaining: UTILIDAD BRUTA → UTILIDAD DE OPERACIÓN → UTILIDAD NETA
        if (startFrom > 0) {
          calculated = baseValue + calculated;
        }
        
        sectionTotals.set(section.section_name, calculated);

        lines.push({
          type: "calculated",
          label: section.section_name,
          amount: calculated,
          isBold: true,
          showLine: true,
        });
      }
    }

    return lines;
  };

  const formatQ = (amount: number) => `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getCdvExportLines = (): string[][] => {
    if (!cdvBreakdown) return [];
    return [
      ['', ''],
      ['COSTO DE VENTAS (Método de Coeficiente):', ''],
      ['  Inventario Inicial de Mercaderías', cdvBreakdown.initialInventory.toFixed(2)],
      ['  (+) Compras Netas del Período', cdvBreakdown.purchases.toFixed(2)],
      ['  (=) Mercadería Disponible p/Venta', cdvBreakdown.availableForSale.toFixed(2)],
      ['  (-) Inventario Final de Mercaderías', cdvBreakdown.finalInventory.toFixed(2)],
      ['  (=) Costo de Ventas', cdvBreakdown.costOfSales.toFixed(2)],
    ];
  };

  const handleExportExcel = () => {
    let headers: string[];
    let data: string[][];

    if (layout === 'columnar') {
      const result = toColumnarExcelData(filteredReportLines);
      headers = result.headers;
      data = result.data;
    } else if (layout === 'stepped') {
      const result = toSteppedExcelData(filteredReportLines);
      headers = result.headers;
      data = result.data;
    } else {
      headers = ["Concepto", "Monto"];
      data = filteredReportLines.map(line => [
        line.type === 'account' ? `  ${line.label}` : line.label,
        line.amount.toFixed(2),
      ]);
    }

    // Append CDV breakdown
    data.push(...getCdvExportLines());

    exportToExcel({
      filename: `Estado_Resultados_${dateFrom}_${dateTo}`,
      title: `Estado de Resultados del ${new Date(dateFrom + 'T00:00:00').toLocaleDateString('es-GT')} al ${new Date(dateTo + 'T00:00:00').toLocaleDateString('es-GT')}`,
      enterpriseName,
      headers,
      data,
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a Excel correctamente",
    });
  };

  const buildPdfExportOptions = () => {
    const maxLevel = Math.max(...filteredReportLines.filter(l => l.type === 'account').map(l => l.accountLevel || 1), 1);
    const levelCount = Math.min(maxLevel, 5);
    const headers = ["Concepto", ...Array.from({ length: levelCount }, (_, i) => `Nivel ${i + 1}`)];

    const data = filteredReportLines.map(line => {
      const row: string[] = [line.type === 'account' ? `  ${line.label}` : line.label];
      for (let i = 0; i < levelCount; i++) {
        if (line.type === 'section') {
          row.push('');
        } else if (line.type === 'account' && line.accountLevel === i + 1) {
          row.push(`Q ${line.amount.toFixed(2)}`);
        } else if ((line.type === 'subtotal' || line.type === 'total' || line.type === 'calculated') && i === levelCount - 1) {
          row.push(`Q ${line.amount.toFixed(2)}`);
        } else {
          row.push('');
        }
      }
      return row;
    });

    if (cdvBreakdown) {
      const emptyLevels = Array(levelCount).fill('');
      const lastLevel = (val: string) => { const cols = Array(levelCount).fill(''); cols[levelCount - 1] = val; return cols; };
      data.push(
        ['', ...emptyLevels],
        ['COSTO DE VENTAS (Método de Coeficiente):', ...emptyLevels],
        ['  Inventario Inicial de Mercaderías', ...lastLevel(`Q ${cdvBreakdown.initialInventory.toFixed(2)}`)],
        ['  (+) Compras Netas del Período', ...lastLevel(`Q ${cdvBreakdown.purchases.toFixed(2)}`)],
        ['  (=) Mercadería Disponible p/Venta', ...lastLevel(`Q ${cdvBreakdown.availableForSale.toFixed(2)}`)],
        ['  (-) Inventario Final de Mercaderías', ...lastLevel(`Q ${cdvBreakdown.finalInventory.toFixed(2)}`)],
        ['  (=) Costo de Ventas', ...lastLevel(`Q ${cdvBreakdown.costOfSales.toFixed(2)}`)],
      );
    }

    const footnote = cdvBreakdown ? 'Costo de ventas calculado por método de coeficiente (inventario periódico)' : undefined;

    return {
      filename: `Estado_Resultados_${dateFrom}_${dateTo}`,
      title: `Estado de Resultados del ${new Date(dateFrom + 'T00:00:00').toLocaleDateString('es-GT')} al ${new Date(dateTo + 'T00:00:00').toLocaleDateString('es-GT')}${footnote ? '\n' + footnote : ''}`,
      enterpriseName,
      headers,
      data,
      forcePortrait: true,
    };
  };

  const handleExportPDF = async (options: FolioExportOptions) => {
    if (options.format === 'excel') {
      handleExportExcel();
      return;
    }

    const result = exportToPDF({
      ...buildPdfExportOptions(),
      folioOptions: {
        includeFolio: options.includeFolio,
        startingFolio: options.startingFolio,
      },
      authorizationLegend: options.authorization
        ? { number: options.authorization.number, date: options.authorization.date }
        : undefined,
    });

    if (options.authorization && result?.pageCount) {
      await consumePages(options.authorization.id, result.pageCount, {
        enterpriseId: options.authorization.enterpriseId,
        bookType: options.authorization.bookType,
        reportPeriod: `Estado de Resultados ${dateFrom} a ${dateTo}`,
        dateFrom,
        dateTo,
      });
    }

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a PDF correctamente",
    });
  };

  // Filter lines based on display level + hide zero-balance accounts
  const filteredReportLines = reportLines
    .filter((line) => line.type !== "account" || Math.abs(line.amount) > 0.00001)
    .filter((line) =>
      displayLevel === 0
        ? true
        : line.type !== "account" || (line.accountLevel !== undefined && line.accountLevel <= displayLevel)
    );

  const { expanded, toggleExpand, visibleLines } = useReportTreeState(filteredReportLines);

  const handleAccountClick = (line: ReportLine) => {
    if (!line.accountId || !line.accountCode) return;
    const parts = line.label.split(' - ');
    const name = parts.length > 1 ? parts.slice(1).join(' - ') : line.label;
    const descendantIds = collectDescendantIds(line.accountId, reportLines);
    setDrawerAccount({ id: line.accountId, code: line.accountCode, name, ids: descendantIds });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div>
          <Label htmlFor="dateFrom">Fecha Desde</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="dateTo">Fecha Hasta</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <div>
          <Label>Nivel de Detalle</Label>
          <Select value={displayLevel.toString()} onValueChange={(v) => setDisplayLevel(parseInt(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar nivel" />
            </SelectTrigger>
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

        <ReportLayoutToggle value={layout} onChange={setLayout} />

        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading || formatLoading} className="w-full">
            {(loading || formatLoading) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar Reporte
          </Button>
        </div>

        {reportLines.length > 0 && (
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={handleExportExcel} className="flex-1">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Excel
            </Button>
            <Button variant="outline" onClick={() => setExportDialogOpen(true)} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        )}
      </div>

      <FolioExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExportPDF}
        title="Exportar Estado de Resultados"
        bookType="libro_estados_financieros"
        enterpriseId={currentEnterpriseId ?? undefined}
      />

      {!format && !formatLoading && currentEnterpriseId && (
        <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          No hay un formato de Estado de Resultados configurado. Ve a Configuración → Estados Financieros para definir la estructura del reporte.
        </div>
      )}

      {filteredReportLines.length > 0 && (
        <div className="rounded-lg border p-4 bg-card">
          <div className="text-center mb-4">
            <h3 className="font-bold text-lg">{enterpriseName}</h3>
            <p className="text-sm text-muted-foreground">
              Estado de Resultados del {new Date(dateFrom + 'T00:00:00').toLocaleDateString('es-GT')} al {new Date(dateTo + 'T00:00:00').toLocaleDateString('es-GT')}
            </p>
          </div>
          {layout === 'columnar' ? (
            <ColumnarReportView lines={visibleLines} expanded={expanded} toggleExpand={toggleExpand} onAccountClick={handleAccountClick} />
          ) : layout === 'stepped' ? (
            <SteppedReportView lines={visibleLines} expanded={expanded} toggleExpand={toggleExpand} onAccountClick={handleAccountClick} />
          ) : (
            <HierarchicalReportView lines={visibleLines} expanded={expanded} toggleExpand={toggleExpand} onAccountClick={handleAccountClick} />
          )}

          {/* CDV Breakdown Section */}
          {cdvBreakdown && (
            <div className="mt-6 pt-4 border-t border-border">
              <h4 className="font-bold text-sm mb-2">COSTO DE VENTAS (Método de Coeficiente):</h4>
              <div className="space-y-1 font-mono text-sm">
                <div className="grid grid-cols-2 gap-4 py-1 pl-4">
                  <div>Inventario Inicial de Mercaderías</div>
                  <div className="text-right">{formatQ(cdvBreakdown.initialInventory)}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 py-1 pl-4">
                  <div>(+) Compras Netas del Período</div>
                  <div className="text-right">{formatQ(cdvBreakdown.purchases)}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 py-1 pl-4 bg-muted/50 font-semibold">
                  <div>(=) Mercadería Disponible p/Venta</div>
                  <div className="text-right">{formatQ(cdvBreakdown.availableForSale)}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 py-1 pl-4">
                  <div>(-) Inventario Final de Mercaderías</div>
                  <div className="text-right">{formatQ(cdvBreakdown.finalInventory)}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 py-1 pl-4 border-t-2 border-border font-bold">
                  <div>(=) Costo de Ventas</div>
                  <div className="text-right">{formatQ(cdvBreakdown.costOfSales)}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 italic">
                Costo de ventas calculado por método de coeficiente (inventario periódico)
              </p>
            </div>
          )}

          {/* Warning when method is coeficiente but no posted closing exists */}
          {config?.cost_of_sales_method === 'coeficiente' && !cdvBreakdown && filteredReportLines.length > 0 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                ⚠️ Costo de ventas no calculado por coeficiente para este período. 
                Realice el cierre del período para incluir el desglose del costo de ventas.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <AccountLedgerDrawer
        open={drawerAccount !== null}
        onOpenChange={(o) => { if (!o) setDrawerAccount(null); }}
        accountId={drawerAccount?.id ?? null}
        accountIds={drawerAccount?.ids}
        accountCode={drawerAccount?.code ?? ''}
        accountName={drawerAccount?.name ?? ''}
        enterpriseId={currentEnterpriseId}
        startDate={dateFrom}
        endDate={dateTo}
      />
    </div>
  );
}

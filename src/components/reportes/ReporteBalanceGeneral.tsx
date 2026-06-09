/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF, estimatePdfPageCount } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useFinancialStatementFormat, Section, SectionAccount } from "@/hooks/useFinancialStatementFormat";
import { useBookAuthorizations } from "@/hooks/useBookAuthorizations";
import ReportLayoutToggle, { type ReportLayout } from "./ReportLayoutToggle";

import SteppedReportView, { toSteppedExcelData } from "./SteppedReportView";
import HierarchicalReportView from "./HierarchicalReportView";
import AccountLedgerDrawer from "./AccountLedgerDrawer";
import { FolioExportDialog, FolioExportOptions } from "./FolioExportDialog";
import type { ReportLine } from "./reportTypes";
import { collectDescendantIds } from "./collectDescendantIds";
import { useReportTreeState } from "./useReportTreeState";

interface AccountBalance {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  balance_type: string | null;
  level: number;
  parent_account_id: number | null;
  balance: number;
  total_debit: number;
  total_credit: number;
}

export default function ReporteBalanceGeneral() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [reportDate, setReportDate] = useState("");
  const [reportLines, setReportLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayLevel, setDisplayLevel] = useState<number>(0);
  const [layout, setLayout] = useState<ReportLayout>('hierarchical');
  const [drawerAccount, setDrawerAccount] = useState<{ id: number; code: string; name: string; ids?: number[] } | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const { toast } = useToast();
  const { consumePages } = useBookAuthorizations(currentEnterpriseId);

  const { format, loading: formatLoading } = useFinancialStatementFormat(
    currentEnterpriseId,
    'balance_general'
  );

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    if (enterpriseId) {
      setCurrentEnterpriseId(parseInt(enterpriseId));
      fetchEnterpriseName(enterpriseId);
    }
    setReportDate(new Date().toISOString().split('T')[0]);
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
      toast({ title: "Error", description: "Selecciona una empresa primero", variant: "destructive" });
      return;
    }
    if (!reportDate) {
      toast({ title: "Error", description: "Debes seleccionar una fecha", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);

      // Fetch balance sheet accounts AND income/expense for period result in parallel
      const year = new Date(reportDate + 'T00:00:00').getFullYear();
      const periodStart = `${year}-01-01`;

      const [balanceRes, pnlRes, periodRes] = await Promise.all([
        supabase.rpc('get_balance_sheet', {
          p_enterprise_id: currentEnterpriseId,
          p_as_of_date: reportDate,
        }),
        supabase.rpc('get_pnl', {
          p_enterprise_id: currentEnterpriseId,
          p_start_date: periodStart,
          p_end_date: reportDate,
        }),
        supabase
          .from('tab_accounting_periods')
          .select('status')
          .eq('enterprise_id', currentEnterpriseId)
          .lte('start_date', reportDate)
          .gte('end_date', reportDate)
          .maybeSingle(),
      ]);

      if (balanceRes.error) throw balanceRes.error;

      // Si el período del año del reporte está cerrado, los asientos de cierre
      // ya capitalizaron el resultado en el patrimonio. No debe sumarse otra vez.
      const periodIsClosed = periodRes.data?.status === 'cerrado';

      const accountBalances: AccountBalance[] = (balanceRes.data || []).map((row: any) => ({
        id: Number(row.account_id),
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        balance_type: row.balance_type ?? null,
        level: row.level,
        parent_account_id: row.parent_account_id ? Number(row.parent_account_id) : null,
        balance: Number(row.balance),
        total_debit: Number(row.total_debit ?? 0),
        total_credit: Number(row.total_credit ?? 0),
      }));

      // Calculate period result from PnL (excludes closing entries)
      const pnlAccounts = (pnlRes.data || []).map((row: any) => ({
        id: Number(row.account_id),
        account_type: row.account_type,
        parent_account_id: row.parent_account_id ? Number(row.parent_account_id) : null,
        balance: Number(row.balance),
      }));

      if (format && format.sections.length > 0) {
        const lines = generateFormattedReport(format.sections, accountBalances, pnlAccounts, periodIsClosed);
        setReportLines(lines);
      } else {
        const simpleLines: ReportLine[] = accountBalances
          .filter(a => ['activo', 'pasivo', 'capital'].includes(a.account_type) && a.balance !== 0)
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
        toast({ title: "Sin datos", description: "No hay movimientos contabilizados hasta la fecha seleccionada" });
      }
    } catch (error: unknown) {
      toast({ title: "Error al generar reporte", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generateFormattedReport = (sections: Section[], accountBalances: AccountBalance[], pnlAccounts: { id: number; account_type: string; parent_account_id: number | null; balance: number }[], periodIsClosed: boolean = false): ReportLine[] => {
    const lines: ReportLine[] = [];
    const sectionTotals: Map<string, number> = new Map();

    const childrenByParent = new Map<number, AccountBalance[]>();
    for (const acc of accountBalances) {
      if (acc.parent_account_id == null) continue;
      const list = childrenByParent.get(acc.parent_account_id) || [];
      list.push(acc);
      childrenByParent.set(acc.parent_account_id, list);
    }

    // Aggregate raw debit/credit for each account (own + descendants), then
    // express the total according to the ROOT account's balance_type. This
    // ensures that, e.g., "Pérdidas Acumuladas" (deudor) under "Patrimonio"
    // (acreedor) correctly subtracts from capital instead of adding.
    const rawAggCache = new Map<number, { debit: number; credit: number }>();
    const getRawAggregated = (accId: number): { debit: number; credit: number } => {
      const cached = rawAggCache.get(accId);
      if (cached) return cached;
      const acc = accountBalances.find(a => a.id === accId);
      if (!acc) {
        const empty = { debit: 0, credit: 0 };
        rawAggCache.set(accId, empty);
        return empty;
      }
      let debit = acc.total_debit;
      let credit = acc.total_credit;
      const children = childrenByParent.get(accId) || [];
      for (const c of children) {
        const sub = getRawAggregated(c.id);
        debit += sub.debit;
        credit += sub.credit;
      }
      const total = { debit, credit };
      rawAggCache.set(accId, total);
      return total;
    };
    const getAggregatedBalance = (accId: number): number => {
      const acc = accountBalances.find(a => a.id === accId);
      if (!acc) return 0;
      const { debit, credit } = getRawAggregated(accId);
      // Normalize to the root account's natural balance side
      const isDeudor = acc.balance_type === 'deudor' || acc.account_type === 'activo';
      return isDeudor ? debit - credit : credit - debit;
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

    // Calculate period result from PnL data (already excludes closing entries)
    const pnlChildrenByParent = new Map<number, typeof pnlAccounts>();
    for (const acc of pnlAccounts) {
      if (acc.parent_account_id == null) continue;
      const list = pnlChildrenByParent.get(acc.parent_account_id) || [];
      list.push(acc);
      pnlChildrenByParent.set(acc.parent_account_id, list);
    }
    const pnlAggCache = new Map<number, number>();
    const getPnlAggBalance = (accId: number): number => {
      const cached = pnlAggCache.get(accId);
      if (cached !== undefined) return cached;
      const acc = pnlAccounts.find(a => a.id === accId);
      if (!acc) return 0;
      const children = pnlChildrenByParent.get(accId) || [];
      const total = acc.balance + children.reduce((sum, c) => sum + getPnlAggBalance(c.id), 0);
      pnlAggCache.set(accId, total);
      return total;
    };
    const rootIncomeAccounts = pnlAccounts.filter(a => a.account_type === "ingreso" && a.parent_account_id === null);
    const rootExpenseAccounts = pnlAccounts.filter(a => (a.account_type === "gasto" || a.account_type === "costo") && a.parent_account_id === null);
    const totalIngresos = rootIncomeAccounts.reduce((sum, acc) => sum + getPnlAggBalance(acc.id), 0);
    const totalGastos = rootExpenseAccounts.reduce((sum, acc) => sum + getPnlAggBalance(acc.id), 0);
    // `get_balance_sheet` excluye los asientos de cierre/traslado, por lo que
    // las cuentas patrimoniales NUNCA reciben el efecto del cierre dentro del
    // propio año. Por tanto el resultado del período siempre se toma del P&L
    // (que también excluye cierres), sin importar si el período está abierto
    // o cerrado — no hay doble suma.
    const periodResult = totalIngresos - totalGastos;

    for (const section of sections) {
      if (!section.show_in_report) continue;

      if (section.section_type === "group") {
        lines.push({ type: "section", label: section.section_name, amount: 0, isBold: true });
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
        let subtotal = 0;
        for (let i = sections.indexOf(section) - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === "subtotal" || prevSection.section_type === "total") break;
          if (prevSection.section_type === "group") {
            subtotal += sectionTotals.get(prevSection.section_name) || 0;
          }
        }
        sectionTotals.set(section.section_name, subtotal);
        lines.push({ type: "subtotal", label: section.section_name, amount: subtotal, isBold: true, showLine: true });
      } else if (section.section_type === "total") {
        let total = 0;
        for (let i = sections.indexOf(section) - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === "total") break;
          if (prevSection.section_type === "calculated") {
            total += sectionTotals.get(prevSection.section_name) || 0;
          } else if (prevSection.section_type === "subtotal") {
            total += sectionTotals.get(prevSection.section_name) || 0;
          } else if (prevSection.section_type === "group") {
            const hasSubtotalAfter = sections.slice(i + 1, sections.indexOf(section)).some(s => s.section_type === "subtotal");
            if (!hasSubtotalAfter) {
              total += sectionTotals.get(prevSection.section_name) || 0;
            }
          }
        }
        sectionTotals.set(section.section_name, total);
        lines.push({ type: "total", label: section.section_name, amount: total, isBold: true, showLine: true });
      } else if (section.section_type === "calculated") {
        sectionTotals.set(section.section_name, periodResult);
        lines.push({ type: "calculated", label: section.section_name, amount: periodResult, isBold: true });
      } else if (section.section_type === "grand_total") {
        let grandTotal = 0;

        if (section.accounts && section.accounts.length > 0) {
          // Si el diseñador asignó cuentas explícitas (p.ej. cuenta 2 y cuenta 3),
          // sumarlas directamente con su jerarquía completa, igual que un grupo.
          for (const sectionAccount of section.accounts) {
            const account = accountBalances.find(a => a.id === sectionAccount.account_id);
            if (!account) continue;
            if (sectionAccount.include_children) {
              grandTotal += getAggregatedBalance(account.id) * sectionAccount.sign_multiplier;
            } else {
              grandTotal += account.balance * sectionAccount.sign_multiplier;
            }
          }
          // Incluir resultados calculados previos (resultado del período) que no
          // están reflejados en las cuentas patrimoniales hasta el cierre anual.
          for (let i = 0; i < sections.indexOf(section); i++) {
            const prev = sections[i];
            if (prev.section_type === 'calculated') {
              grandTotal += sectionTotals.get(prev.section_name) || 0;
            }
          }
        } else {
          // Fallback histórico: sumar todos los "total" anteriores excepto el primero (TOTAL ACTIVO).
          const previousTotals = sections
            .slice(0, sections.indexOf(section))
            .filter(s => s.section_type === 'total');
          grandTotal = previousTotals.slice(1).reduce(
            (sum, s) => sum + (sectionTotals.get(s.section_name) || 0),
            0
          );
        }

        sectionTotals.set(section.section_name, grandTotal);
        lines.push({ type: "total", label: section.section_name, amount: grandTotal, isBold: true, showLine: true });
      }
    }

    // Compatibilidad con formatos guardados antes de añadir "grand_total":
    // si hay 2+ "total" y no existe ningún "grand_total", añadimos automáticamente
    // "TOTAL PASIVO Y CAPITAL" para que el balance cuadre visualmente.
    const hasGrandTotal = sections.some(s => s.section_type === 'grand_total');
    const totalSections = sections.filter(s => s.section_type === 'total');
    if (!hasGrandTotal && totalSections.length >= 2) {
      const grandTotal = totalSections.slice(1).reduce(
        (sum, s) => sum + (sectionTotals.get(s.section_name) || 0),
        0
      );
      lines.push({ type: "total", label: "TOTAL PASIVO Y CAPITAL", amount: grandTotal, isBold: true, showLine: true });
    }

    return lines;
  };

  const handleExportExcel = () => {
    let headers: string[];
    let data: string[][];

    if (layout === 'stepped') {
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

    exportToExcel({
      filename: `Balance_General_${reportDate}`,
      title: `Balance General al ${new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}`,
      enterpriseName,
      headers,
      data,
    });

    toast({ title: "Exportado", description: "El reporte se ha exportado a Excel correctamente" });
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

    return {
      filename: `Balance_General_${reportDate}`,
      title: `Balance General al ${new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}`,
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
        reportPeriod: `Balance General al ${reportDate}`,
        dateTo: reportDate,
      });
    }

    toast({ title: "Exportado", description: "El reporte se ha exportado a PDF correctamente" });
  };

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
    // Collect descendant account IDs for consolidated ledger
    const descendantIds = collectDescendantIds(line.accountId, reportLines);
    setDrawerAccount({ id: line.accountId, code: line.accountCode, name, ids: descendantIds });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div>
          <Label htmlFor="reportDate">Fecha del Balance</Label>
          <Input
            id="reportDate"
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
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
            Generar Balance
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
        title="Exportar Balance General"
        bookType="libro_estados_financieros"
        enterpriseId={currentEnterpriseId ?? undefined}
        estimatePageCount={reportLines.length === 0 ? undefined : () => estimatePdfPageCount(buildPdfExportOptions())}
      />

      {!format && !formatLoading && currentEnterpriseId && (
        <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
          No hay un formato de Balance General configurado. Ve a Configuración → Estados Financieros para definir la estructura del reporte.
        </div>
      )}

      {filteredReportLines.length > 0 && (
        <div className="rounded-lg border p-4 bg-card">
          <div className="text-center mb-4">
            <h3 className="font-bold text-lg">{enterpriseName}</h3>
            <p className="text-sm text-muted-foreground">
              Balance General al {new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}
            </p>
          </div>
          {layout === 'stepped' ? (
            <SteppedReportView lines={visibleLines} expanded={expanded} toggleExpand={toggleExpand} onAccountClick={handleAccountClick} />
          ) : (
            <HierarchicalReportView lines={visibleLines} expanded={expanded} toggleExpand={toggleExpand} onAccountClick={handleAccountClick} />
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
        endDate={reportDate}
      />
    </div>
  );
}

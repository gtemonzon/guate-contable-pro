import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useFinancialStatementFormat, Section, SectionAccount } from "@/hooks/useFinancialStatementFormat";
import ReportLayoutToggle, { type ReportLayout } from "./ReportLayoutToggle";
import ColumnarReportView, { toColumnarExcelData } from "./ColumnarReportView";
import SteppedReportView, { toSteppedExcelData } from "./SteppedReportView";
import HierarchicalReportView from "./HierarchicalReportView";
import AccountLedgerDrawer from "./AccountLedgerDrawer";
import type { ReportLine } from "./reportTypes";
import { collectDescendantIds } from "./collectDescendantIds";

interface AccountBalance {
  id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  level: number;
  parent_account_id: number | null;
  balance: number;
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
  const { toast } = useToast();

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
    } catch (error: any) {
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

      const { data: rpcData, error: rpcError } = await supabase.rpc('get_balance_sheet', {
        p_enterprise_id: currentEnterpriseId,
        p_as_of_date: reportDate,
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

      if (format && format.sections.length > 0) {
        const lines = generateFormattedReport(format.sections, accountBalances);
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
    } catch (error: any) {
      toast({ title: "Error al generar reporte", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const generateFormattedReport = (sections: Section[], accountBalances: AccountBalance[]): ReportLine[] => {
    const lines: ReportLine[] = [];
    const sectionTotals: Map<string, number> = new Map();

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

    const rootIncomeAccounts = accountBalances.filter(a => a.account_type === "ingreso" && a.parent_account_id === null);
    const rootExpenseAccounts = accountBalances.filter(a => a.account_type === "gasto" && a.parent_account_id === null);
    const totalIngresos = rootIncomeAccounts.reduce((sum, acc) => sum + getAggregatedBalance(acc.id), 0);
    const totalGastos = rootExpenseAccounts.reduce((sum, acc) => sum + getAggregatedBalance(acc.id), 0);
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
      }
    }

    return lines;
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

    exportToExcel({
      filename: `Balance_General_${reportDate}`,
      title: `Balance General al ${new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}`,
      enterpriseName,
      headers,
      data,
    });

    toast({ title: "Exportado", description: "El reporte se ha exportado a Excel correctamente" });
  };

  const handleExportPDF = () => {
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

    exportToPDF({
      filename: `Balance_General_${reportDate}`,
      title: `Balance General al ${new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}`,
      enterpriseName,
      headers,
      data,
      forcePortrait: true,
    });

    toast({ title: "Exportado", description: "El reporte se ha exportado a PDF correctamente" });
  };

  const filteredReportLines = reportLines
    .filter((line) => line.type !== "account" || Math.abs(line.amount) > 0.00001)
    .filter((line) =>
      displayLevel === 0
        ? true
        : line.type !== "account" || (line.accountLevel !== undefined && line.accountLevel <= displayLevel)
    );

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
            <Button variant="outline" onClick={handleExportPDF} className="flex-1">
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        )}
      </div>

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
          {layout === 'columnar' ? (
            <ColumnarReportView lines={filteredReportLines} onAccountClick={handleAccountClick} />
          ) : layout === 'stepped' ? (
            <SteppedReportView lines={filteredReportLines} onAccountClick={handleAccountClick} />
          ) : (
            <HierarchicalReportView lines={filteredReportLines} onAccountClick={handleAccountClick} />
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

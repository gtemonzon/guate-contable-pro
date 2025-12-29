import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { useFinancialStatementFormat, Section, SectionAccount } from "@/hooks/useFinancialStatementFormat";

interface ReportLine {
  type: 'section' | 'account' | 'subtotal' | 'total' | 'calculated';
  label: string;
  amount: number;
  level?: number;
  accountLevel?: number;
  isBold?: boolean;
  showLine?: boolean;
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

export default function ReporteBalanceGeneral() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [reportDate, setReportDate] = useState("");
  const [reportLines, setReportLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayLevel, setDisplayLevel] = useState<number>(0); // 0 = all levels
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
      toast({
        title: "Error",
        description: "Selecciona una empresa primero",
        variant: "destructive",
      });
      return;
    }

    if (!reportDate) {
      toast({
        title: "Error",
        description: "Debes seleccionar una fecha",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Get ALL accounts for the enterprise (needed for hierarchy)
      const { data: accountsData, error: accountsError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name, account_type, level, parent_account_id")
        .eq("enterprise_id", currentEnterpriseId)
        .eq("is_active", true)
        .order("account_code");

      if (accountsError) throw accountsError;

      // Get all journal entry details up to the report date
      const detailsData = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entry_details")
          .select(`
            *,
            tab_journal_entries!inner(
              entry_date,
              enterprise_id,
              is_posted
            )
          `)
          .eq("tab_journal_entries.enterprise_id", currentEnterpriseId)
          .eq("tab_journal_entries.is_posted", true)
          .lte("tab_journal_entries.entry_date", reportDate)
      );

      // Calculate balances per account
      const balanceMap = new Map<number, { debit: number; credit: number }>();
      
      (detailsData || []).forEach((detail: any) => {
        const current = balanceMap.get(detail.account_id) || { debit: 0, credit: 0 };
        current.debit += Number(detail.debit_amount || 0);
        current.credit += Number(detail.credit_amount || 0);
        balanceMap.set(detail.account_id, current);
      });

      // Create balance data with correct sign logic
      const accountBalances: AccountBalance[] = (accountsData || []).map((acc: any) => {
        const movements = balanceMap.get(acc.id) || { debit: 0, credit: 0 };
        // Activo: Debe - Haber. Pasivo/Capital: Haber - Debe
        const balance = acc.account_type === "activo"
          ? (movements.debit - movements.credit)
          : (movements.credit - movements.debit);

        return {
          id: acc.id,
          account_code: acc.account_code,
          account_name: acc.account_name,
          account_type: acc.account_type,
          level: acc.level,
          parent_account_id: acc.parent_account_id,
          balance,
        };
      });

      // If we have a configured format, use it
      if (format && format.sections.length > 0) {
        const lines = generateFormattedReport(format.sections, accountBalances);
        setReportLines(lines);
      } else {
        // Fallback to simple list of accounts with movements
        const simpleLines: ReportLine[] = accountBalances
          .filter(a => ['activo', 'pasivo', 'capital'].includes(a.account_type) && a.balance !== 0)
          .map(a => ({
            type: 'account' as const,
            label: `${a.account_code} - ${a.account_name}`,
            amount: a.balance,
            level: a.level,
          }));
        setReportLines(simpleLines);
      }

      if (reportLines.length === 0 && !format) {
        toast({
          title: "Sin datos",
          description: "No hay movimientos contabilizados hasta la fecha seleccionada",
        });
      }
    } catch (error: any) {
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
    let totalIngresos = 0;
    let totalGastos = 0;

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

    const pushAccountTree = (root: AccountBalance, signMultiplier: number, depth: number) => {
      const amount = getAggregatedBalance(root.id) * signMultiplier;
      lines.push({
        type: "account",
        label: `${root.account_code} - ${root.account_name}`,
        amount,
        level: depth,
        accountLevel: root.level,
      });

      const children = (childrenByParent.get(root.id) || []).slice().sort((a, b) => a.account_code.localeCompare(b.account_code));
      for (const child of children) {
        pushAccountTree(child, signMultiplier, depth + 1);
      }
    };

    // Calculate income and expenses for "RESULTADO DEL PERÍODO"
    accountBalances.forEach(acc => {
      if (acc.account_type === "ingreso") {
        totalIngresos += acc.balance;
      } else if (acc.account_type === "gasto") {
        totalGastos += acc.balance;
      }
    });
    const periodResult = totalIngresos - totalGastos;

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
            // Add ONLY the top aggregated value to the section total (avoid double counting children)
            sectionTotal += getAggregatedBalance(account.id) * sectionAccount.sign_multiplier;
            // Render full hierarchy (parents show roll-up)
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
        // Sum previous groups, subtotals, and calculated sections
        let total = 0;
        for (let i = sections.indexOf(section) - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === "total") {
            break;
          }
          if (prevSection.section_type === "calculated") {
            total += sectionTotals.get(prevSection.section_name) || 0;
          } else if (prevSection.section_type === "subtotal") {
            total += sectionTotals.get(prevSection.section_name) || 0;
          } else if (prevSection.section_type === "group") {
            const hasSubtotalAfter = sections
              .slice(i + 1, sections.indexOf(section))
              .some(s => s.section_type === "subtotal");
            if (!hasSubtotalAfter) {
              total += sectionTotals.get(prevSection.section_name) || 0;
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
        // Special calculation: RESULTADO DEL PERÍODO = Ingresos - Gastos
        sectionTotals.set(section.section_name, periodResult);

        lines.push({
          type: "calculated",
          label: section.section_name,
          amount: periodResult,
          isBold: true,
        });
      }
    }

    return lines;
  };

  const handleExportExcel = () => {
    const headers = ["Concepto", "Monto"];
    const data = reportLines.map(line => [
      line.type === 'account' ? `  ${line.label}` : line.label,
      line.amount.toFixed(2),
    ]);

    exportToExcel({
      filename: `Balance_General_${reportDate}`,
      title: `Balance General al ${new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}`,
      enterpriseName,
      headers,
      data,
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a Excel correctamente",
    });
  };

  const handleExportPDF = () => {
    const headers = ["Concepto", "Monto"];
    const data = reportLines.map(line => [
      line.type === 'account' ? `  ${line.label}` : line.label,
      `Q ${line.amount.toFixed(2)}`,
    ]);

    exportToPDF({
      filename: `Balance_General_${reportDate}`,
      title: `Balance General al ${new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}`,
      enterpriseName,
      headers,
      data,
    });

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
          <div className="space-y-1 font-mono text-sm">
            {filteredReportLines.map((line, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-2 gap-4 py-1 ${line.isBold ? 'font-bold' : ''} ${line.showLine ? 'border-t border-border' : ''}`}
                style={{ paddingLeft: line.type === 'account' ? `${Math.min(48, (line.level ?? 1) * 16)}px` : '0' }}
              >
                <div>{line.label}</div>
                <div className="text-right">
                  {line.type !== 'section' ? `Q ${line.amount.toFixed(2)}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

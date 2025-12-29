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
import { useFinancialStatementFormat, Section } from "@/hooks/useFinancialStatementFormat";

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

export default function ReporteEstadoResultados() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reportLines, setReportLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [displayLevel, setDisplayLevel] = useState<number>(0);
  const { toast } = useToast();

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

      // Get ALL accounts for the enterprise (needed for hierarchy)
      const { data: accountsData, error: accountsError } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name, account_type, level, parent_account_id")
        .eq("enterprise_id", currentEnterpriseId)
        .eq("is_active", true)
        .order("account_code");

      if (accountsError) throw accountsError;

      // Get journal entry details for the period
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
          .gte("tab_journal_entries.entry_date", dateFrom)
          .lte("tab_journal_entries.entry_date", dateTo)
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
      // Ingreso: Haber - Debe (positive = income)
      // Gasto: Debe - Haber (positive = expense)
      const accountBalances: AccountBalance[] = (accountsData || []).map((acc: any) => {
        const movements = balanceMap.get(acc.id) || { debit: 0, credit: 0 };
        let balance = 0;
        
        if (acc.account_type === 'ingreso') {
          balance = movements.credit - movements.debit;
        } else if (acc.account_type === 'gasto' || acc.account_type === 'costo') {
          balance = movements.debit - movements.credit;
        } else {
          // For other types, just use debit - credit
          balance = movements.debit - movements.credit;
        }

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
          .filter(a => ['ingreso', 'gasto', 'costo'].includes(a.account_type) && a.balance !== 0)
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
          description: "No hay movimientos de ingresos o gastos en el período",
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

    for (const section of sections) {
      if (!section.show_in_report) continue;

      if (section.section_type === 'group') {
        // Section header
        lines.push({
          type: 'section',
          label: section.section_name,
          amount: 0,
          isBold: true,
        });

        // Calculate section total from assigned accounts
        let sectionTotal = 0;

        for (const sectionAccount of section.accounts) {
          const account = accountBalances.find(a => a.id === sectionAccount.account_id);
          if (!account) continue;

          // Get all accounts to display (parent + children if include_children)
          const accountsToDisplay: AccountBalance[] = [account];
          
          if (sectionAccount.include_children) {
            const childIds = getAllChildAccountIds(account.id, accountBalances);
            for (const childId of childIds) {
              const childAcc = accountBalances.find(a => a.id === childId);
              if (childAcc) {
                accountsToDisplay.push(childAcc);
              }
            }
          }

          // Show each account line with its own balance
          for (const acc of accountsToDisplay) {
            const accAmount = acc.balance * sectionAccount.sign_multiplier;
            lines.push({
              type: 'account',
              label: `${acc.account_code} - ${acc.account_name}`,
              amount: accAmount,
              level: acc.level,
              accountLevel: acc.level,
            });
            sectionTotal += accAmount;
          }
        }

        sectionTotals.set(section.section_name, sectionTotal);

      } else if (section.section_type === 'subtotal') {
        // Sum all previous group sections until another subtotal or total
        let subtotal = 0;
        for (let i = sections.indexOf(section) - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === 'subtotal' || prevSection.section_type === 'total') {
            break;
          }
          if (prevSection.section_type === 'group') {
            subtotal += sectionTotals.get(prevSection.section_name) || 0;
          }
        }
        sectionTotals.set(section.section_name, subtotal);

        lines.push({
          type: 'subtotal',
          label: section.section_name,
          amount: subtotal,
          isBold: true,
          showLine: true,
        });

      } else if (section.section_type === 'total') {
        // Sum all subtotals until another total
        let total = 0;
        for (let i = sections.indexOf(section) - 1; i >= 0; i--) {
          const prevSection = sections[i];
          if (prevSection.section_type === 'total') {
            break;
          }
          if (prevSection.section_type === 'subtotal') {
            total += sectionTotals.get(prevSection.section_name) || 0;
          } else if (prevSection.section_type === 'group') {
            // If no subtotals, sum groups directly
            const hasSubtotalAfter = sections.slice(i + 1, sections.indexOf(section))
              .some(s => s.section_type === 'subtotal');
            if (!hasSubtotalAfter) {
              total += sectionTotals.get(prevSection.section_name) || 0;
            }
          }
        }
        sectionTotals.set(section.section_name, total);

        lines.push({
          type: 'total',
          label: section.section_name,
          amount: total,
          isBold: true,
          showLine: true,
        });

      } else if (section.section_type === 'calculated') {
        // For Estado de Resultados, calculated fields like UTILIDAD NETA
        // Sum all previous totals/subtotals with appropriate signs
        // The calculation depends on the position and what came before
        
        // Simple approach: sum all group totals with their natural signs
        // Ingresos are positive, Gastos/Costos are negative for net income
        let calculated = 0;
        
        // Find all groups and apply appropriate sign
        for (const s of sections) {
          if (s.section_type === 'group') {
            const sectionVal = sectionTotals.get(s.section_name) || 0;
            // If the section name suggests it's income, add it
            // If it suggests expenses/costs, subtract it
            const sectionNameLower = s.section_name.toLowerCase();
            if (sectionNameLower.includes('ingreso') || sectionNameLower.includes('venta')) {
              calculated += sectionVal;
            } else if (sectionNameLower.includes('gasto') || sectionNameLower.includes('costo')) {
              calculated -= sectionVal;
            }
          }
        }

        lines.push({
          type: 'calculated',
          label: section.section_name,
          amount: calculated,
          isBold: true,
          showLine: true,
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

  const handleExportPDF = () => {
    const headers = ["Concepto", "Monto"];
    const data = reportLines.map(line => [
      line.type === 'account' ? `  ${line.label}` : line.label,
      `Q ${line.amount.toFixed(2)}`,
    ]);

    exportToPDF({
      filename: `Estado_Resultados_${dateFrom}_${dateTo}`,
      title: `Estado de Resultados del ${new Date(dateFrom + 'T00:00:00').toLocaleDateString('es-GT')} al ${new Date(dateTo + 'T00:00:00').toLocaleDateString('es-GT')}`,
      enterpriseName,
      headers,
      data,
    });

    toast({
      title: "Exportado",
      description: "El reporte se ha exportado a PDF correctamente",
    });
  };

  // Filter lines based on display level
  const filteredReportLines = displayLevel === 0 
    ? reportLines 
    : reportLines.filter(line => 
        line.type !== 'account' || (line.accountLevel !== undefined && line.accountLevel <= displayLevel)
      );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
            <Button variant="outline" onClick={handleExportPDF} className="flex-1">
              <FileText className="h-4 w-4 mr-2" />
              PDF
            </Button>
          </div>
        )}
      </div>

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
          <div className="space-y-1 font-mono text-sm">
            {filteredReportLines.map((line, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-2 gap-4 py-1 ${line.isBold ? 'font-bold' : ''} ${line.showLine ? 'border-t border-border' : ''}`}
                style={{ paddingLeft: line.type === 'account' ? '24px' : '0' }}
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

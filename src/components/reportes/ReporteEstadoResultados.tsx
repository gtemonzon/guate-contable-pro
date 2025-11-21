import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";

interface ResultAccount {
  account_code: string;
  account_name: string;
  amount: number;
  level: number;
}

export default function ReporteEstadoResultados() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [accounts, setAccounts] = useState<ResultAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchEnterpriseName(enterpriseId);
    }

    // Set default dates to current month
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
      
      // Get accounts classified for income statement
      const { data: accountsData, error: accountsError } = await supabase
        .from("tab_accounts")
        .select("*")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .eq("is_active", true)
        .or("is_income_account.eq.true,is_cost_account.eq.true,is_expense_account.eq.true")
        .order("account_code");

      if (accountsError) throw accountsError;

      // Get journal entry details for the period (con paginación automática)
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
          .eq("tab_journal_entries.enterprise_id", parseInt(currentEnterpriseId))
          .eq("tab_journal_entries.is_posted", true)
          .gte("tab_journal_entries.entry_date", dateFrom)
          .lte("tab_journal_entries.entry_date", dateTo)
      );

      // Calculate amounts per account
      const amountMap = new Map<number, number>();
      
      (detailsData || []).forEach((detail: any) => {
        const current = amountMap.get(detail.account_id) || 0;
        const amount = Number(detail.credit_amount || 0) - Number(detail.debit_amount || 0);
        amountMap.set(detail.account_id, current + amount);
      });

      // Create result data
      const resultData: ResultAccount[] = (accountsData || []).map(acc => ({
        account_code: acc.account_code,
        account_name: acc.account_name,
        amount: amountMap.get(acc.id) || 0,
        level: acc.level,
      })).filter(acc => acc.amount !== 0);

      setAccounts(resultData);
      
      if (resultData.length === 0) {
        toast({
          title: "Sin datos",
          description: "No hay cuentas de ingresos, costos o gastos con movimientos en el período. Verifica que las cuentas estén clasificadas correctamente en el catálogo.",
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

  const handleExportExcel = () => {
    const headers = ["Código", "Cuenta", "Monto"];
    const data = accounts.map(a => [
      a.account_code,
      "  ".repeat(a.level - 1) + a.account_name,
      a.amount.toFixed(2),
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
    const headers = ["Código", "Cuenta", "Monto"];
    const data = accounts.map(a => [
      a.account_code,
      "  ".repeat(a.level - 1) + a.account_name,
      `Q ${a.amount.toFixed(2)}`,
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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

        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar Reporte
          </Button>
        </div>

        {accounts.length > 0 && (
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

      {accounts.length > 0 && (
        <div className="rounded-lg border p-4 bg-card">
          <div className="text-center mb-4">
            <h3 className="font-bold text-lg">{enterpriseName}</h3>
            <p className="text-sm text-muted-foreground">
              Estado de Resultados del {new Date(dateFrom + 'T00:00:00').toLocaleDateString('es-GT')} al {new Date(dateTo + 'T00:00:00').toLocaleDateString('es-GT')}
            </p>
          </div>
          <div className="space-y-1 font-mono text-sm">
            {accounts.map((account, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-3 gap-2 ${account.level === 1 ? 'font-bold' : ''}`}
                style={{ paddingLeft: `${(account.level - 1) * 20}px` }}
              >
                <div>{account.account_code}</div>
                <div>{account.account_name}</div>
                <div className="text-right">{account.amount !== 0 ? `Q ${account.amount.toFixed(2)}` : '-'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";

interface BalanceAccount {
  account_code: string;
  account_name: string;
  debit_balance: number;
  credit_balance: number;
  level: number;
}

export default function ReporteBalanceGeneral() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [reportDate, setReportDate] = useState("");
  const [accounts, setAccounts] = useState<BalanceAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchEnterpriseName(enterpriseId);
    }

    // Set default date to today
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
      
      // Get all accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from("tab_accounts")
        .select("*")
        .eq("enterprise_id", parseInt(currentEnterpriseId))
        .eq("is_active", true)
        .order("account_code");

      if (accountsError) throw accountsError;

      // Get all journal entry details up to the report date
      const { data: detailsData, error: detailsError } = await supabase
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
        .lte("tab_journal_entries.entry_date", reportDate);

      if (detailsError) throw detailsError;

      // Calculate balances per account
      const balanceMap = new Map<number, { debit: number, credit: number }>();
      
      (detailsData || []).forEach((detail: any) => {
        const current = balanceMap.get(detail.account_id) || { debit: 0, credit: 0 };
        current.debit += Number(detail.debit_amount || 0);
        current.credit += Number(detail.credit_amount || 0);
        balanceMap.set(detail.account_id, current);
      });

      // Create balance data
      const balanceData: BalanceAccount[] = (accountsData || []).map(acc => {
        const balance = balanceMap.get(acc.id) || { debit: 0, credit: 0 };
        const netBalance = balance.debit - balance.credit;
        
        return {
          account_code: acc.account_code,
          account_name: acc.account_name,
          debit_balance: netBalance > 0 ? netBalance : 0,
          credit_balance: netBalance < 0 ? Math.abs(netBalance) : 0,
          level: acc.level,
        };
      }).filter(acc => acc.debit_balance !== 0 || acc.credit_balance !== 0);

      setAccounts(balanceData);
      
      if (balanceData.length === 0) {
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

  const handleExportExcel = () => {
    const headers = ["Código", "Cuenta", "Debe", "Haber"];
    const data = accounts.map(a => [
      a.account_code,
      "  ".repeat(a.level - 1) + a.account_name,
      a.debit_balance.toFixed(2),
      a.credit_balance.toFixed(2),
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
    const headers = ["Código", "Cuenta", "Debe", "Haber"];
    const data = accounts.map(a => [
      a.account_code,
      "  ".repeat(a.level - 1) + a.account_name,
      `Q ${a.debit_balance.toFixed(2)}`,
      `Q ${a.credit_balance.toFixed(2)}`,
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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="reportDate">Fecha del Balance</Label>
          <Input
            id="reportDate"
            type="date"
            value={reportDate}
            onChange={(e) => setReportDate(e.target.value)}
          />
        </div>

        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Generar Balance
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
              Balance General al {new Date(reportDate + 'T00:00:00').toLocaleDateString('es-GT')}
            </p>
          </div>
          <div className="space-y-1 font-mono text-sm">
            {accounts.map((account, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-4 gap-2 ${account.level === 1 ? 'font-bold' : ''}`}
                style={{ paddingLeft: `${(account.level - 1) * 20}px` }}
              >
                <div>{account.account_code}</div>
                <div className="col-span-1">{account.account_name}</div>
                <div className="text-right">{account.debit_balance > 0 ? `Q ${account.debit_balance.toFixed(2)}` : '-'}</div>
                <div className="text-right">{account.credit_balance > 0 ? `Q ${account.credit_balance.toFixed(2)}` : '-'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

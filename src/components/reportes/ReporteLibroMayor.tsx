import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
}

interface LedgerEntry {
  id: number;
  entry_date: string;
  entry_number: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
  previous_balance?: number;
}

export default function ReporteLibroMayor() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [selectedAccountInfo, setSelectedAccountInfo] = useState<Account | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");

  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchAccounts(enterpriseId);
      fetchEnterpriseName(enterpriseId);
      
      // Establecer fechas por defecto (año actual)
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), 0, 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchAccounts(newEnterpriseId);
        fetchEnterpriseName(newEnterpriseId);
      } else {
        setAccounts([]);
        setLedgerEntries([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleStorageChange);
    };
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
      console.error("Error fetching enterprise name:", error);
    }
  };

  const fetchAccounts = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("is_active", true)
        .order("account_code");

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar cuentas",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const generateReport = async () => {
    if (!selectedAccount || !startDate || !endDate || !currentEnterpriseId) {
      toast({
        title: "Campos requeridos",
        description: "Selecciona una cuenta y un rango de fechas",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Guardar info de la cuenta seleccionada
      const accountInfo = accounts.find(a => a.id === selectedAccount);
      setSelectedAccountInfo(accountInfo || null);

      // Obtener la cuenta seleccionada para verificar si permite movimiento
      const { data: accountData, error: accountError } = await supabase
        .from("tab_accounts")
        .select("id, allows_movement, account_code")
        .eq("id", selectedAccount)
        .single();

      if (accountError) throw accountError;

      // Función recursiva para obtener todas las cuentas hijas que permiten movimiento
      const getDetailAccountIds = async (accountId: number): Promise<number[]> => {
        const { data: childAccounts, error } = await supabase
          .from("tab_accounts")
          .select("id, allows_movement")
          .eq("parent_account_id", accountId)
          .eq("enterprise_id", parseInt(currentEnterpriseId))
          .eq("is_active", true);

        if (error) throw error;

        let detailIds: number[] = [];

        for (const child of childAccounts || []) {
          if (child.allows_movement) {
            detailIds.push(child.id);
          } else {
            const childDetailIds = await getDetailAccountIds(child.id);
            detailIds = [...detailIds, ...childDetailIds];
          }
        }

        return detailIds;
      };

      // Determinar qué cuentas consultar
      let accountIdsToQuery: number[] = [];
      if (accountData.allows_movement) {
        accountIdsToQuery = [selectedAccount];
      } else {
        accountIdsToQuery = await getDetailAccountIds(selectedAccount);
      }

      if (accountIdsToQuery.length === 0) {
        setLedgerEntries([]);
        toast({
          title: "Sin movimientos",
          description: "Esta cuenta no tiene cuentas de detalle con movimientos",
          variant: "default",
        });
        setLoading(false);
        return;
      }

      // Obtener detalles de partidas que afectan las cuentas
      const { data: details, error: detailsError } = await supabase
        .from("tab_journal_entry_details")
        .select(`
          id,
          debit_amount,
          credit_amount,
          description,
          journal_entry_id,
          tab_journal_entries!inner (
            id,
            entry_number,
            entry_date,
            description,
            is_posted,
            enterprise_id
          )
        `)
        .in("account_id", accountIdsToQuery)
        .eq("tab_journal_entries.enterprise_id", parseInt(currentEnterpriseId))
        .eq("tab_journal_entries.is_posted", true)
        .gte("tab_journal_entries.entry_date", startDate)
        .lte("tab_journal_entries.entry_date", endDate);

      if (detailsError) throw detailsError;

      // Ordenar por fecha
      const sortedDetails = (details || []).sort((a: any, b: any) => {
        const dateA = new Date(a.tab_journal_entries.entry_date).getTime();
        const dateB = new Date(b.tab_journal_entries.entry_date).getTime();
        return dateA - dateB;
      });

      // Calcular saldo anterior (antes del startDate)
      const { data: previousDetails, error: prevError } = await supabase
        .from("tab_journal_entry_details")
        .select(`
          debit_amount,
          credit_amount,
          tab_journal_entries!inner (
            entry_date,
            is_posted,
            enterprise_id
          )
        `)
        .in("account_id", accountIdsToQuery)
        .eq("tab_journal_entries.enterprise_id", parseInt(currentEnterpriseId))
        .eq("tab_journal_entries.is_posted", true)
        .lt("tab_journal_entries.entry_date", startDate);

      if (prevError) throw prevError;

      // Calcular saldo inicial
      let previousBalance = 0;
      (previousDetails || []).forEach((detail: any) => {
        const debit = Number(detail.debit_amount) || 0;
        const credit = Number(detail.credit_amount) || 0;
        previousBalance += debit - credit;
      });

      // Calcular balance acumulado comenzando con el saldo anterior
      let runningBalance = previousBalance;
      const entries: LedgerEntry[] = sortedDetails.map((detail: any) => {
        const debit = Number(detail.debit_amount) || 0;
        const credit = Number(detail.credit_amount) || 0;
        runningBalance += debit - credit;

        return {
          id: detail.id,
          entry_date: detail.tab_journal_entries.entry_date,
          entry_number: detail.tab_journal_entries.entry_number,
          description: detail.description || detail.tab_journal_entries.description,
          debit_amount: debit,
          credit_amount: credit,
          balance: runningBalance,
          previous_balance: previousBalance,
        };
      });

      setLedgerEntries(entries);
      
      toast({
        title: "Reporte generado",
        description: `Se encontraron ${entries.length} movimientos`,
      });
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
    if (ledgerEntries.length === 0 || !selectedAccountInfo) return;

    const headers = ["Fecha", "No. Partida", "Descripción", "Debe", "Haber", "Saldo"];
    const data = ledgerEntries.map(entry => [
      entry.entry_date,
      entry.entry_number,
      entry.description,
      entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : "-",
      entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : "-",
      formatCurrency(Math.abs(entry.balance)),
    ]);

    const totalDebit = ledgerEntries.reduce((sum, entry) => sum + entry.debit_amount, 0);
    const totalCredit = ledgerEntries.reduce((sum, entry) => sum + entry.credit_amount, 0);
    const previousBalance = ledgerEntries[0]?.previous_balance || 0;
    const finalBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance : 0;

    exportToExcel({
      filename: `libro-mayor-${selectedAccountInfo.account_code}-${startDate}-${endDate}`,
      title: `Libro Mayor - ${selectedAccountInfo.account_code} ${selectedAccountInfo.account_name}`,
      enterpriseName: enterpriseName,
      headers,
      data,
      totals: [
        { label: "Saldo Anterior", value: formatCurrency(Math.abs(previousBalance)) },
        { label: "Total Debe", value: formatCurrency(totalDebit) },
        { label: "Total Haber", value: formatCurrency(totalCredit) },
        { label: "Saldo Final", value: formatCurrency(Math.abs(finalBalance)) },
      ],
    });
  };

  const handleExportPDF = () => {
    if (ledgerEntries.length === 0 || !selectedAccountInfo) return;

    const headers = ["Fecha", "No. Partida", "Descripción", "Debe", "Haber", "Saldo"];
    const data = ledgerEntries.map(entry => [
      entry.entry_date,
      entry.entry_number,
      entry.description,
      entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : "-",
      entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : "-",
      formatCurrency(Math.abs(entry.balance)),
    ]);

    const totalDebit = ledgerEntries.reduce((sum, entry) => sum + entry.debit_amount, 0);
    const totalCredit = ledgerEntries.reduce((sum, entry) => sum + entry.credit_amount, 0);
    const previousBalance = ledgerEntries[0]?.previous_balance || 0;
    const finalBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance : 0;

    exportToPDF({
      filename: `libro-mayor-${selectedAccountInfo.account_code}-${startDate}-${endDate}`,
      title: `Libro Mayor - ${selectedAccountInfo.account_code} ${selectedAccountInfo.account_name}`,
      enterpriseName: enterpriseName,
      headers,
      data,
      totals: [
        { label: "Saldo Anterior", value: formatCurrency(Math.abs(previousBalance)) },
        { label: "Total Debe", value: formatCurrency(totalDebit) },
        { label: "Total Haber", value: formatCurrency(totalCredit) },
        { label: "Saldo Final", value: formatCurrency(Math.abs(finalBalance)) },
      ],
    });
  };

  const totalDebit = ledgerEntries.reduce((sum, entry) => sum + entry.debit_amount, 0);
  const totalCredit = ledgerEntries.reduce((sum, entry) => sum + entry.credit_amount, 0);
  const previousBalance = ledgerEntries[0]?.previous_balance || 0;
  const finalBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance : 0;

  if (!currentEnterpriseId) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Selecciona una empresa para generar el reporte
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="account-select">Cuenta Contable</Label>
          <Select 
            value={selectedAccount ? String(selectedAccount) : undefined} 
            onValueChange={(v) => setSelectedAccount(parseInt(v))}
          >
            <SelectTrigger id="account-select">
              <SelectValue placeholder="Seleccionar cuenta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={String(account.id)}>
                  {account.account_code} - {account.account_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="start-date">Desde</Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="end-date">Hasta</Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-4">
        <Button onClick={generateReport} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generar Reporte
        </Button>
        
        {ledgerEntries.length > 0 && (
          <>
            <Button variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" onClick={handleExportPDF}>
              <FileDown className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </>
        )}
      </div>

      {ledgerEntries.length > 0 && selectedAccountInfo && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">
                {selectedAccountInfo.account_code} - {selectedAccountInfo.account_name}
              </h3>
              <p className="text-sm text-muted-foreground">
                Del {startDate} al {endDate}
              </p>
            </div>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Saldo Anterior: </span>
                <Badge variant="outline" className={previousBalance < 0 ? 'text-red-600' : ''}>
                  {formatCurrency(Math.abs(previousBalance))}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Total Debe: </span>
                <Badge variant="secondary">{formatCurrency(totalDebit)}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Total Haber: </span>
                <Badge variant="secondary">{formatCurrency(totalCredit)}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Saldo Final: </span>
                <Badge variant={finalBalance >= 0 ? "default" : "destructive"}>
                  {formatCurrency(Math.abs(finalBalance))}
                </Badge>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Fecha</TableHead>
                  <TableHead className="w-[150px]">No. Partida</TableHead>
                  <TableHead className="min-w-[250px]">Descripción</TableHead>
                  <TableHead className="w-[120px] text-right">Debe</TableHead>
                  <TableHead className="w-[120px] text-right">Haber</TableHead>
                  <TableHead className="w-[120px] text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{entry.entry_date}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.entry_number}
                    </TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : "-"}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${entry.balance < 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(Math.abs(entry.balance))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {ledgerEntries.length === 0 && !loading && selectedAccount && (
        <div className="text-center text-muted-foreground py-8">
          No se encontraron movimientos para los criterios seleccionados
        </div>
      )}
    </div>
  );
}

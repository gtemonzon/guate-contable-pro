import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileDown, FileSpreadsheet, Loader2, Check, ChevronsUpDown } from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

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
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);

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

  const toggleAccount = (accountId: number) => {
    setSelectedAccounts(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const toggleAllAccounts = () => {
    if (selectedAccounts.length === accounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(accounts.map(a => a.id));
    }
  };

  const generateReport = async () => {
    if (selectedAccounts.length === 0 || !startDate || !endDate || !currentEnterpriseId) {
      toast({
        title: "Campos requeridos",
        description: "Selecciona al menos una cuenta y un rango de fechas",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      setReportGenerated(false);

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

      // Obtener todas las cuentas de detalle para las cuentas seleccionadas
      let accountIdsToQuery: number[] = [];
      
      for (const accountId of selectedAccounts) {
        const { data: accountData, error: accountError } = await supabase
          .from("tab_accounts")
          .select("id, allows_movement")
          .eq("id", accountId)
          .single();

        if (accountError) throw accountError;

        if (accountData.allows_movement) {
          accountIdsToQuery.push(accountId);
        } else {
          const childIds = await getDetailAccountIds(accountId);
          accountIdsToQuery = [...accountIdsToQuery, ...childIds];
        }
      }

      if (accountIdsToQuery.length === 0) {
        setLedgerEntries([]);
        toast({
          title: "Sin movimientos",
          description: "Las cuentas seleccionadas no tienen movimientos",
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
      setReportGenerated(true);
      
      toast({
        title: "Reporte generado",
        description: `Se encontraron ${entries.length} movimientos para ${selectedAccounts.length} cuenta(s)`,
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
    if (ledgerEntries.length === 0) return;

    const selectedAccountsInfo = accounts.filter(a => selectedAccounts.includes(a.id));
    const accountsLabel = selectedAccounts.length === accounts.length 
      ? "Todas las cuentas"
      : selectedAccountsInfo.map(a => `${a.account_code} ${a.account_name}`).join(", ");

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
      filename: `libro-mayor-${startDate}-${endDate}`,
      title: `Libro Mayor - ${accountsLabel}`,
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
    if (ledgerEntries.length === 0) return;

    const selectedAccountsInfo = accounts.filter(a => selectedAccounts.includes(a.id));
    const accountsLabel = selectedAccounts.length === accounts.length 
      ? "Todas las cuentas"
      : selectedAccountsInfo.map(a => `${a.account_code} ${a.account_name}`).join(", ");

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
      filename: `libro-mayor-${startDate}-${endDate}`,
      title: `Libro Mayor - ${accountsLabel}`,
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

  const selectedAccountsInfo = accounts.filter(a => selectedAccounts.includes(a.id));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Cuentas Contables</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                {selectedAccounts.length === 0
                  ? "Seleccionar cuentas..."
                  : selectedAccounts.length === accounts.length
                  ? "Todas las cuentas"
                  : `${selectedAccounts.length} cuenta(s) seleccionada(s)`}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0 bg-popover" align="start">
              <div className="max-h-[300px] overflow-y-auto p-2">
                <div className="flex items-center space-x-2 px-2 py-2 border-b">
                  <Checkbox
                    id="select-all"
                    checked={selectedAccounts.length === accounts.length}
                    onCheckedChange={toggleAllAccounts}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Seleccionar todas
                  </label>
                </div>
                <div className="space-y-1 mt-2">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      className="flex items-center space-x-2 px-2 py-1.5 hover:bg-accent rounded-sm cursor-pointer"
                      onClick={() => toggleAccount(account.id)}
                    >
                      <Checkbox
                        id={`account-${account.id}`}
                        checked={selectedAccounts.includes(account.id)}
                        onCheckedChange={() => toggleAccount(account.id)}
                      />
                      <label
                        htmlFor={`account-${account.id}`}
                        className="text-sm flex-1 cursor-pointer"
                      >
                        {account.account_code} - {account.account_name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
        <Button onClick={generateReport} disabled={loading || selectedAccounts.length === 0}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Generar Reporte
        </Button>
        
        {reportGenerated && ledgerEntries.length > 0 && (
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

      {reportGenerated && ledgerEntries.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">
                {selectedAccounts.length === accounts.length
                  ? "Todas las cuentas"
                  : selectedAccountsInfo.map(a => `${a.account_code} - ${a.account_name}`).join(", ")}
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

      {reportGenerated && ledgerEntries.length === 0 && !loading && (
        <div className="text-center text-muted-foreground py-8">
          No se encontraron movimientos para los criterios seleccionados
        </div>
      )}
    </div>
  );
}

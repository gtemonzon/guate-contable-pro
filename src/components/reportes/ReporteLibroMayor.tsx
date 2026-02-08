import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, ChevronsUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel, exportToPDF } from "@/utils/reportExport";
import { FolioExportDialog, FolioExportOptions } from "./FolioExportDialog";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  balance_type?: string;
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
  account_id: number;
}

interface AccountLedger {
  account: Account;
  entries: LedgerEntry[];
  previousBalance: number;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
}

export default function ReporteLibroMayor() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [accountLedgers, setAccountLedgers] = useState<AccountLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());

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
        setAccountLedgers([]);
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
        .select("id, account_code, account_name, balance_type")
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

  const toggleExpandAccount = (accountId: number) => {
    setExpandedAccounts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(accountId)) {
        newSet.delete(accountId);
      } else {
        newSet.add(accountId);
      }
      return newSet;
    });
  };

  const toggleExpandAll = () => {
    if (expandedAccounts.size === accountLedgers.length) {
      setExpandedAccounts(new Set());
    } else {
      setExpandedAccounts(new Set(accountLedgers.map(al => al.account.id)));
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
      // Mantenemos un mapa de cuenta original -> cuentas de detalle
      const accountDetailMap: Map<number, number[]> = new Map();
      
      for (const accountId of selectedAccounts) {
        const { data: accountData, error: accountError } = await supabase
          .from("tab_accounts")
          .select("id, allows_movement")
          .eq("id", accountId)
          .single();

        if (accountError) throw accountError;

        if (accountData.allows_movement) {
          accountDetailMap.set(accountId, [accountId]);
        } else {
          const childIds = await getDetailAccountIds(accountId);
          if (childIds.length > 0) {
            accountDetailMap.set(accountId, childIds);
          }
        }
      }

      // Obtener todos los IDs de cuentas de detalle únicos
      const allDetailAccountIds = Array.from(new Set(
        Array.from(accountDetailMap.values()).flat()
      ));

      if (allDetailAccountIds.length === 0) {
        setAccountLedgers([]);
        toast({
          title: "Sin movimientos",
          description: "Las cuentas seleccionadas no tienen movimientos",
          variant: "default",
        });
        setLoading(false);
        return;
      }

      // Obtener detalles de partidas que afectan las cuentas (con paginación automática)
      const details = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entry_details")
          .select(`
            id,
            account_id,
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
          .in("account_id", allDetailAccountIds)
          .eq("tab_journal_entries.enterprise_id", parseInt(currentEnterpriseId))
          .eq("tab_journal_entries.is_posted", true)
          .gte("tab_journal_entries.entry_date", startDate)
          .lte("tab_journal_entries.entry_date", endDate)
      );

      // Calcular saldo anterior (antes del startDate) con paginación automática
      const previousDetails = await fetchAllRecords<any>(
        supabase
          .from("tab_journal_entry_details")
          .select(`
            account_id,
            debit_amount,
            credit_amount,
            tab_journal_entries!inner (
              entry_date,
              is_posted,
              enterprise_id
            )
          `)
          .in("account_id", allDetailAccountIds)
          .eq("tab_journal_entries.enterprise_id", parseInt(currentEnterpriseId))
          .eq("tab_journal_entries.is_posted", true)
          .lt("tab_journal_entries.entry_date", startDate)
      );

      // Calcular saldo anterior por cuenta de detalle
      const previousBalanceByAccount: Record<number, number> = {};
      (previousDetails || []).forEach((detail: any) => {
        const debit = Number(detail.debit_amount) || 0;
        const credit = Number(detail.credit_amount) || 0;
        if (!previousBalanceByAccount[detail.account_id]) {
          previousBalanceByAccount[detail.account_id] = 0;
        }
        previousBalanceByAccount[detail.account_id] += debit - credit;
      });

      // Agrupar movimientos por cuenta seleccionada
      const ledgers: AccountLedger[] = [];

      for (const [originalAccountId, detailAccountIds] of accountDetailMap) {
        const accountInfo = accounts.find(a => a.id === originalAccountId);
        if (!accountInfo) continue;

        // Filtrar detalles que pertenecen a esta cuenta (o sus hijas)
        const accountDetails = (details || []).filter((d: any) => 
          detailAccountIds.includes(d.account_id)
        );

        // Ordenar por fecha
        const sortedDetails = accountDetails.sort((a: any, b: any) => {
          const dateA = new Date(a.tab_journal_entries.entry_date).getTime();
          const dateB = new Date(b.tab_journal_entries.entry_date).getTime();
          return dateA - dateB;
        });

        // Calcular saldo anterior para esta cuenta
        let previousBalance = 0;
        for (const detailAccountId of detailAccountIds) {
          previousBalance += previousBalanceByAccount[detailAccountId] || 0;
        }

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
            account_id: detail.account_id,
          };
        });

        const totalDebit = entries.reduce((sum, e) => sum + e.debit_amount, 0);
        const totalCredit = entries.reduce((sum, e) => sum + e.credit_amount, 0);

        // Solo agregar cuentas que tienen movimientos en el período
        if (entries.length > 0) {
          ledgers.push({
            account: accountInfo,
            entries,
            previousBalance,
            totalDebit,
            totalCredit,
            finalBalance: entries[entries.length - 1].balance,
          });
        }
      }

      // Ordenar por código de cuenta
      ledgers.sort((a, b) => a.account.account_code.localeCompare(b.account.account_code));

      setAccountLedgers(ledgers);
      // Expandir todas las cuentas por defecto
      setExpandedAccounts(new Set(ledgers.map(l => l.account.id)));
      setReportGenerated(true);
      
      const totalMovements = ledgers.reduce((sum, l) => sum + l.entries.length, 0);
      toast({
        title: "Reporte generado",
        description: `Se encontraron ${totalMovements} movimientos en ${ledgers.length} cuenta(s)`,
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

  const handleExport = (options: FolioExportOptions) => {
    if (accountLedgers.length === 0) return;

    const headers = ["Cuenta", "Fecha", "No. Partida", "Descripción", "Debe", "Haber", "Saldo"];
    const data: any[][] = [];

    accountLedgers.forEach(ledger => {
      // Agregar encabezado de cuenta
      data.push([
        `${ledger.account.account_code} - ${ledger.account.account_name}`,
        "",
        "",
        `Saldo Anterior: ${formatCurrency(Math.abs(ledger.previousBalance))}`,
        "",
        "",
        ""
      ]);

      // Agregar movimientos
      ledger.entries.forEach(entry => {
        data.push([
          "",
          entry.entry_date,
          entry.entry_number,
          entry.description,
          entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : "-",
          entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : "-",
          formatCurrency(Math.abs(entry.balance)),
        ]);
      });

      // Agregar totales de la cuenta
      data.push([
        "",
        "",
        "",
        "TOTALES:",
        formatCurrency(ledger.totalDebit),
        formatCurrency(ledger.totalCredit),
        formatCurrency(Math.abs(ledger.finalBalance)),
      ]);

      // Línea en blanco entre cuentas
      data.push(["", "", "", "", "", "", ""]);
    });

    const grandTotalDebit = accountLedgers.reduce((sum, l) => sum + l.totalDebit, 0);
    const grandTotalCredit = accountLedgers.reduce((sum, l) => sum + l.totalCredit, 0);

    const exportOptions = {
      filename: `Libro_Mayor_${startDate}_${endDate}`,
      title: `Libro Mayor - Del ${startDate} al ${endDate}`,
      enterpriseName: enterpriseName,
      headers,
      data,
      totals: [
        { label: "Total General Debe", value: formatCurrency(grandTotalDebit) },
        { label: "Total General Haber", value: formatCurrency(grandTotalCredit) },
        { label: "Cantidad de Cuentas", value: accountLedgers.length.toString() },
      ],
    };

    if (options.format === 'excel') {
      exportToExcel(exportOptions);
    } else {
      exportToPDF({
        ...exportOptions,
        folioOptions: {
          includeFolio: options.includeFolio,
          startingFolio: options.startingFolio,
        },
      });
    }

    toast({
      title: "Exportado",
      description: `El reporte se ha exportado a ${options.format.toUpperCase()} correctamente`,
    });
  };

  const grandTotalDebit = accountLedgers.reduce((sum, l) => sum + l.totalDebit, 0);
  const grandTotalCredit = accountLedgers.reduce((sum, l) => sum + l.totalCredit, 0);

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
        
        {reportGenerated && accountLedgers.length > 0 && (
          <>
            <Button variant="outline" onClick={() => setExportDialogOpen(true)}>
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={toggleExpandAll}>
              {expandedAccounts.size === accountLedgers.length ? "Contraer todo" : "Expandir todo"}
            </Button>
          </>
        )}
      </div>

      <FolioExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onExport={handleExport}
        title="Exportar Libro Mayor"
      />

      {reportGenerated && accountLedgers.length > 0 && (
        <div className="space-y-4">
          {/* Totales generales */}
          <div className="flex justify-end gap-6 text-sm p-4 bg-muted rounded-lg">
            <div>
              <span className="text-muted-foreground">Total General Debe: </span>
              <span className="font-semibold">{formatCurrency(grandTotalDebit)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Total General Haber: </span>
              <span className="font-semibold">{formatCurrency(grandTotalCredit)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cuentas: </span>
              <span className="font-semibold">{accountLedgers.length}</span>
            </div>
          </div>

          {/* Lista de cuentas con sus movimientos */}
          {accountLedgers.map((ledger) => (
            <Collapsible
              key={ledger.account.id}
              open={expandedAccounts.has(ledger.account.id)}
              onOpenChange={() => toggleExpandAccount(ledger.account.id)}
            >
              <div className="border rounded-lg overflow-hidden">
                <CollapsibleTrigger asChild>
                  <div className="flex justify-between items-center p-4 bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      {expandedAccounts.has(ledger.account.id) ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                      <div>
                        <h3 className="font-semibold">
                          {ledger.account.account_code} - {ledger.account.account_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Del {startDate} al {endDate} • {ledger.entries.length} movimiento(s)
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Saldo Ant: </span>
                        <Badge variant="outline" className={ledger.previousBalance < 0 ? 'text-destructive' : ''}>
                          {formatCurrency(Math.abs(ledger.previousBalance))}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Debe: </span>
                        <Badge variant="secondary">{formatCurrency(ledger.totalDebit)}</Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Haber: </span>
                        <Badge variant="secondary">{formatCurrency(ledger.totalCredit)}</Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Saldo Final: </span>
                        <Badge variant={ledger.finalBalance >= 0 ? "default" : "destructive"}>
                          {formatCurrency(Math.abs(ledger.finalBalance))}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>
                
                <CollapsibleContent>
                  {ledger.entries.length > 0 ? (
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
                        {ledger.entries.map((entry) => (
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
                            <TableCell className={`text-right font-mono font-semibold ${entry.balance < 0 ? 'text-destructive' : ''}`}>
                              {formatCurrency(Math.abs(entry.balance))}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      Sin movimientos en el período seleccionado
                    </div>
                  )}
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))}
        </div>
      )}

      {reportGenerated && accountLedgers.length === 0 && !loading && (
        <div className="text-center text-muted-foreground py-8">
          No se encontraron movimientos para los criterios seleccionados
        </div>
      )}
    </div>
  );
}

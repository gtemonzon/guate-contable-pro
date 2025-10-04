import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  journal_entry_id: number;
}

interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  details: JournalEntryDetail[];
}

interface JournalEntryDetail {
  line_number: number;
  account_code: string;
  account_name: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

export default function MayorGeneral() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<JournalEntry | null>(null);
  const [showJournalDialog, setShowJournalDialog] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchAccounts(enterpriseId);
      // Establecer fechas por defecto (año actual)
      const today = new Date();
      const firstDay = new Date(today.getFullYear(), 0, 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(today.toISOString().split('T')[0]);
    } else {
      toast({
        title: "Selecciona una empresa",
        description: "Debes seleccionar una empresa primero",
        variant: "destructive",
      });
    }

    const handleStorageChange = () => {
      const newEnterpriseId = localStorage.getItem("currentEnterpriseId");
      setCurrentEnterpriseId(newEnterpriseId);
      if (newEnterpriseId) {
        fetchAccounts(newEnterpriseId);
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

  const fetchAccounts = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", parseInt(enterpriseId))
        .eq("is_active", true)
        .eq("is_detail_account", true)
        .order("account_code");

      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      toast({
        title: "Error al cargar cuentas",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchLedger = async () => {
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

      // Obtener detalles de partidas que afectan la cuenta
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
        .eq("account_id", selectedAccount)
        .eq("tab_journal_entries.enterprise_id", parseInt(currentEnterpriseId))
        .eq("tab_journal_entries.is_posted", true)
        .gte("tab_journal_entries.entry_date", startDate)
        .lte("tab_journal_entries.entry_date", endDate)
        .order("tab_journal_entries.entry_date", { ascending: true });

      if (detailsError) throw detailsError;

      // Calcular balance acumulado
      let runningBalance = 0;
      const entries: LedgerEntry[] = (details || []).map((detail: any) => {
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
          journal_entry_id: detail.journal_entry_id,
        };
      });

      setLedgerEntries(entries);
    } catch (error: any) {
      toast({
        title: "Error al cargar movimientos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const viewJournalEntry = async (journalEntryId: number) => {
    try {
      // Obtener la partida completa
      const { data: entry, error: entryError } = await supabase
        .from("tab_journal_entries")
        .select("*")
        .eq("id", journalEntryId)
        .single();

      if (entryError) throw entryError;

      // Obtener los detalles con información de cuentas
      const { data: details, error: detailsError } = await supabase
        .from("tab_journal_entry_details")
        .select(`
          *,
          tab_accounts!inner (
            account_code,
            account_name
          )
        `)
        .eq("journal_entry_id", journalEntryId)
        .order("line_number");

      if (detailsError) throw detailsError;

      const journalEntry: JournalEntry = {
        ...entry,
        details: (details || []).map((d: any) => ({
          line_number: d.line_number,
          account_code: d.tab_accounts.account_code,
          account_name: d.tab_accounts.account_name,
          description: d.description,
          debit_amount: Number(d.debit_amount) || 0,
          credit_amount: Number(d.credit_amount) || 0,
        })),
      };

      setSelectedJournalEntry(journalEntry);
      setShowJournalDialog(true);
    } catch (error: any) {
      toast({
        title: "Error al cargar póliza",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const totalDebit = ledgerEntries.reduce((sum, entry) => sum + entry.debit_amount, 0);
  const totalCredit = ledgerEntries.reduce((sum, entry) => sum + entry.credit_amount, 0);
  const finalBalance = ledgerEntries.length > 0 ? ledgerEntries[ledgerEntries.length - 1].balance : 0;

  if (!currentEnterpriseId) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Selecciona una empresa para ver el mayor general
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mayor General</h1>
        <p className="text-muted-foreground">Movimientos detallados por cuenta contable</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div className="flex items-end">
              <Button onClick={fetchLedger} className="w-full">
                Consultar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {ledgerEntries.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Movimientos de la Cuenta</CardTitle>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Debe: </span>
                  <Badge variant="secondary">Q {totalDebit.toFixed(2)}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Haber: </span>
                  <Badge variant="secondary">Q {totalCredit.toFixed(2)}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Saldo Final: </span>
                  <Badge variant={finalBalance >= 0 ? "default" : "destructive"}>
                    Q {Math.abs(finalBalance).toFixed(2)}
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Cargando...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Fecha</TableHead>
                      <TableHead className="w-[150px]">No. Partida</TableHead>
                      <TableHead className="min-w-[250px]">Descripción</TableHead>
                      <TableHead className="w-[120px] text-right">Debe</TableHead>
                      <TableHead className="w-[120px] text-right">Haber</TableHead>
                      <TableHead className="w-[120px] text-right">Saldo</TableHead>
                      <TableHead className="w-[100px]">Póliza</TableHead>
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
                          {entry.debit_amount > 0 ? `Q ${entry.debit_amount.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {entry.credit_amount > 0 ? `Q ${entry.credit_amount.toFixed(2)}` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          Q {Math.abs(entry.balance).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => viewJournalEntry(entry.journal_entry_id)}
                            title="Ver póliza"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal de Póliza */}
      <Dialog open={showJournalDialog} onOpenChange={setShowJournalDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Póliza</DialogTitle>
          </DialogHeader>
          {selectedJournalEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">No. Partida</p>
                  <p className="font-semibold">{selectedJournalEntry.entry_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fecha</p>
                  <p className="font-semibold">{selectedJournalEntry.entry_date}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Descripción</p>
                  <p className="font-semibold">{selectedJournalEntry.description}</p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Línea</TableHead>
                    <TableHead className="w-[150px]">Código</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Debe</TableHead>
                    <TableHead className="text-right">Haber</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedJournalEntry.details.map((detail) => (
                    <TableRow key={detail.line_number}>
                      <TableCell>{detail.line_number}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {detail.account_code}
                      </TableCell>
                      <TableCell>{detail.account_name}</TableCell>
                      <TableCell>{detail.description}</TableCell>
                      <TableCell className="text-right font-mono">
                        {detail.debit_amount > 0 ? `Q ${detail.debit_amount.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {detail.credit_amount > 0 ? `Q ${detail.credit_amount.toFixed(2)}` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted">
                    <TableCell colSpan={4} className="text-right">Total</TableCell>
                    <TableCell className="text-right">
                      Q {selectedJournalEntry.total_debit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      Q {selectedJournalEntry.total_credit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

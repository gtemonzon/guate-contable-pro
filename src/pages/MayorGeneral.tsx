import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { getFiscalFloorDate } from "@/utils/fiscalFloor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, ChevronsUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  previous_balance?: number;
}

interface AccountLedger {
  account: Account;
  entries: LedgerEntry[];
  previousBalance: number;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
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
  created_by_name?: string;
  created_at?: string;
  updated_by_name?: string;
  updated_at?: string;
}

interface JournalEntryDetail {
  line_number: number;
  account_code: string;
  account_name: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
}

// Función para formatear fecha y hora
const formatDateTime = (dateString: string | null | undefined) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function MayorGeneral() {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [accountLedgers, setAccountLedgers] = useState<AccountLedger[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [selectedJournalEntry, setSelectedJournalEntry] = useState<JournalEntry | null>(null);
  const [showJournalDialog, setShowJournalDialog] = useState(false);
  const [accountsPopoverOpen, setAccountsPopoverOpen] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());
  const [levelFilter, setLevelFilter] = useState<number | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchAccounts(enterpriseId);
      
      // Verificar si vienen parámetros de URL
      const accountIdParam = searchParams.get("accountId");
      const startDateParam = searchParams.get("startDate");
      const endDateParam = searchParams.get("endDate");
      
      if (accountIdParam) {
        setSelectedAccounts([parseInt(accountIdParam)]);
      }
      
      if (startDateParam && endDateParam) {
        setStartDate(startDateParam);
        setEndDate(endDateParam);
      } else {
        // Use active period if available, otherwise fall back to current year
        const savedPeriodId = localStorage.getItem(`currentPeriodId_${enterpriseId}`);
        if (savedPeriodId) {
          supabase
            .from('tab_accounting_periods')
            .select('start_date, end_date')
            .eq('id', parseInt(savedPeriodId))
            .single()
            .then(({ data }) => {
              if (data) {
                setStartDate(data.start_date);
                setEndDate(data.end_date);
              } else {
                const today = new Date();
                setStartDate(`${today.getFullYear()}-01-01`);
                setEndDate(today.toISOString().split('T')[0]);
              }
            });
        } else {
          const today = new Date();
          setStartDate(`${today.getFullYear()}-01-01`);
          setEndDate(today.toISOString().split('T')[0]);
        }
      }
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
        setAccountLedgers([]);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("enterpriseChanged", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("enterpriseChanged", handleStorageChange);
    };
  }, [searchParams]);

  // Auto-consultar cuando se seleccione cuenta desde URL
  useEffect(() => {
    if (selectedAccounts.length > 0 && startDate && endDate && currentEnterpriseId) {
      const accountIdParam = searchParams.get("accountId");
      if (accountIdParam && selectedAccounts.includes(parseInt(accountIdParam))) {
        // Solo auto-consultar si viene de URL
        fetchLedger();
      }
    }
  }, [selectedAccounts, startDate, endDate]);

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
    } catch (error: unknown) {
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

  const accountLevels = useMemo(() => {
    const levels = new Set<number>();
    accounts.forEach(a => {
      const dotLevel = a.account_code.split('.').filter(s => s.length > 0).length;
      levels.add(dotLevel);
    });
    return Array.from(levels).sort();
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    if (levelFilter === null) return accounts;
    return accounts.filter(a => {
      const dotLevel = a.account_code.split('.').filter(s => s.length > 0).length;
      return dotLevel === levelFilter;
    });
  }, [accounts, levelFilter]);

  const toggleAllAccounts = () => {
    const targetAccounts = filteredAccounts;
    const allSelected = targetAccounts.every(a => selectedAccounts.includes(a.id));
    if (allSelected) {
      setSelectedAccounts(prev => prev.filter(id => !targetAccounts.some(a => a.id === id)));
    } else {
      const newIds = targetAccounts.map(a => a.id);
      setSelectedAccounts(prev => Array.from(new Set([...prev, ...newIds])));
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

  const fetchLedger = async () => {
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
          description: "Las cuentas seleccionadas no tienen cuentas de detalle con movimientos",
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

      // Calcular saldo anterior (desde la partida de apertura más reciente hasta startDate)
      const fiscalFloor = await getFiscalFloorDate(parseInt(currentEnterpriseId), startDate);
      let previousQuery = supabase
          .from("tab_journal_entry_details")
          .select(`
            account_id,
            debit_amount,
            credit_amount,
            tab_journal_entries!inner (
              entry_date,
              is_posted,
              enterprise_id,
              accounting_period_id
            )
          `)
          .in("account_id", allDetailAccountIds)
          .eq("tab_journal_entries.enterprise_id", parseInt(currentEnterpriseId))
          .eq("tab_journal_entries.is_posted", true)
          .lt("tab_journal_entries.entry_date", startDate);

      if (fiscalFloor) {
        previousQuery = previousQuery.gte("tab_journal_entries.entry_date", fiscalFloor);
      }

      const previousDetails = await fetchAllRecords<any>(previousQuery);

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
            journal_entry_id: detail.journal_entry_id,
            previous_balance: previousBalance,
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
    } catch (error: unknown) {
      toast({
        title: "Error al cargar movimientos",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const viewJournalEntry = async (journalEntryId: number) => {
    try {
      // Obtener la partida completa con información de auditoría
      const { data: entry, error: entryError } = await supabase
        .from("tab_journal_entries")
        .select(`
          *,
          creator:tab_users!tab_journal_entries_created_by_fkey(full_name),
          modifier:tab_users!tab_journal_entries_updated_by_fkey(full_name)
        `)
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
        created_by_name: entry.creator?.full_name,
        created_at: entry.created_at,
        updated_by_name: entry.modifier?.full_name,
        updated_at: entry.updated_at,
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
    } catch (error: unknown) {
      toast({
        title: "Error al cargar póliza",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const grandTotalDebit = accountLedgers.reduce((sum, l) => sum + l.totalDebit, 0);
  const grandTotalCredit = accountLedgers.reduce((sum, l) => sum + l.totalCredit, 0);

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
              <Label>Cuentas Contables</Label>
              <Popover open={accountsPopoverOpen} onOpenChange={setAccountsPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    {selectedAccounts.length === 0 
                      ? "Seleccionar cuentas..." 
                      : selectedAccounts.length === accounts.length
                      ? "Todas las cuentas"
                      : `${selectedAccounts.length} cuenta(s)`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar cuenta..." />
                    <div className="flex flex-wrap gap-1 px-2 py-2 border-b">
                      <Button
                        variant={levelFilter === null ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setLevelFilter(null)}
                      >
                        Todos
                      </Button>
                      {accountLevels.map((level) => (
                        <Button
                          key={level}
                          variant={levelFilter === level ? "default" : "outline"}
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setLevelFilter(level)}
                        >
                          Nivel {level}
                        </Button>
                      ))}
                    </div>
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>No se encontraron cuentas.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={toggleAllAccounts}>
                          <Checkbox
                            checked={filteredAccounts.length > 0 && filteredAccounts.every(a => selectedAccounts.includes(a.id))}
                            className="mr-2"
                          />
                          <span className="font-semibold">Seleccionar todas</span>
                        </CommandItem>
                        {filteredAccounts.map((account) => (
                          <CommandItem
                            key={account.id}
                            value={`${account.account_code} ${account.account_name}`}
                            onSelect={() => toggleAccount(account.id)}
                          >
                            <Checkbox
                              checked={selectedAccounts.includes(account.id)}
                              className="mr-2"
                            />
                            <span className="font-mono text-xs mr-2">{account.account_code}</span>
                            <span className="truncate">{account.account_name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
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
            <div className="flex items-end">
              <Button onClick={fetchLedger} className="w-full" disabled={loading || selectedAccounts.length === 0}>
                {loading ? "Consultando..." : "Consultar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {accountLedgers.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
                <CardTitle>Movimientos por Cuenta</CardTitle>
                <Button variant="outline" size="sm" onClick={toggleExpandAll}>
                  {expandedAccounts.size === accountLedgers.length ? "Contraer todo" : "Expandir todo"}
                </Button>
              </div>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Debe: </span>
                  <Badge variant="secondary">{formatCurrency(grandTotalDebit)}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Haber: </span>
                  <Badge variant="secondary">{formatCurrency(grandTotalCredit)}</Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Cuentas: </span>
                  <Badge variant="outline">{accountLedgers.length}</Badge>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Cargando...</p>
            ) : (
              <div className="space-y-4">
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
                                {ledger.entries.length} movimiento(s)
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
                        {detail.debit_amount > 0 ? formatCurrency(detail.debit_amount) : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {detail.credit_amount > 0 ? formatCurrency(detail.credit_amount) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted">
                    <TableCell colSpan={4} className="text-right">Total</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(selectedJournalEntry.total_debit)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(selectedJournalEntry.total_credit)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Información de Auditoría */}
              <div className="text-xs text-muted-foreground border-t pt-3 mt-4 space-y-1">
                {selectedJournalEntry.created_by_name && (
                  <p>
                    <span className="font-medium">Creado por:</span> {selectedJournalEntry.created_by_name} - {formatDateTime(selectedJournalEntry.created_at)}
                  </p>
                )}
                {selectedJournalEntry.updated_by_name && selectedJournalEntry.updated_at && (
                  <p>
                    <span className="font-medium">Modificado por:</span> {selectedJournalEntry.updated_by_name} - {formatDateTime(selectedJournalEntry.updated_at)}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

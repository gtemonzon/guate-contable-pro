/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, ChevronsUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/utils/reportExport";
import { FolioExportDialog, FolioExportOptions } from "./FolioExportDialog";
import { useBookAuthorizations } from "@/hooks/useBookAuthorizations";
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
import EntityLink from "@/components/ui/entity-link";
import { ReportCurrencySelector, defaultReportCurrencyState, type ReportCurrencyState } from "./ReportCurrencySelector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  parent_account_id?: number | null;
  balance_type?: string;
}

interface LedgerEntry {
  id: number;
  journal_entry_id: number;
  entry_date: string;
  entry_number: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
  previous_balance?: number;
  account_id: number;
  source_account_code?: string;
  source_account_name?: string;
  currency_code?: string | null;
  exchange_rate?: number | null;
  original_debit?: number | null;
  original_credit?: number | null;
  reference?: string | null;
  beneficiary_name?: string | null;
}

interface AccountLedger {
  account: Account;
  entries: LedgerEntry[];
  previousBalance: number;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  isConsolidated: boolean;
  descendantCount: number;
}

export default function ReporteLibroMayor() {
  const [searchParams] = useSearchParams();
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
  const [levelFilter, setLevelFilter] = useState<number | null>(null);
  const [currencyView, setCurrencyView] = useState<ReportCurrencyState>(defaultReportCurrencyState);
  const [accountSearch, setAccountSearch] = useState("");

  const { toast } = useToast();

  useEffect(() => {
    const enterpriseId = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(enterpriseId);
    
    if (enterpriseId) {
      fetchAccounts(enterpriseId);
      fetchEnterpriseName(enterpriseId);

      // Read URL params for date context
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
        // Use active period if available, otherwise current year
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
  }, [searchParams]);

  // Auto-generate when navigated with URL params (account + dates)
  const urlAccountId = searchParams.get("accountId");
  const autoTriggered = useState(false);
  useEffect(() => {
    if (urlAccountId && selectedAccounts.length > 0 && startDate && endDate && currentEnterpriseId && accounts.length > 0 && !autoTriggered[0]) {
      autoTriggered[1](true);
      generateReport();
    }
  }, [selectedAccounts, startDate, endDate, accounts]);

  const fetchEnterpriseName = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_enterprises")
        .select("business_name")
        .eq("id", parseInt(enterpriseId))
        .single();

      if (error) throw error;
      setEnterpriseName(data?.business_name || "");
    } catch (error: unknown) {
      console.error("Error fetching enterprise name:", error);
    }
  };

  const fetchAccounts = async (enterpriseId: string) => {
    try {
      const { data, error } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name, parent_account_id, balance_type")
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

  // Compute available levels and filtered accounts
  const accountLevels = useMemo(() => {
    const levels = new Set<number>();
    accounts.forEach(a => {
      const level = a.account_code.replace(/\.0*$/, '').split('.').length;
      // Also count by dots: level = number of segments
      const dotLevel = a.account_code.split('.').filter(s => s.length > 0).length;
      levels.add(dotLevel);
    });
    return Array.from(levels).sort((a, b) => a - b);
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    if (levelFilter === null) return accounts;
    return accounts.filter(a => {
      const level = a.account_code.split('.').filter(s => s.length > 0).length;
      return level === levelFilter;
    });
  }, [accounts, levelFilter]);

  const searchedAccounts = useMemo(() => {
    const term = accountSearch.trim().toLowerCase();
    if (!term) return filteredAccounts;
    return filteredAccounts.filter(a =>
      a.account_code.toLowerCase().includes(term) ||
      a.account_name.toLowerCase().includes(term)
    );
  }, [filteredAccounts, accountSearch]);

  const toggleAccount = (accountId: number) => {
    setSelectedAccounts(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const toggleAllAccounts = () => {
    const targetAccounts = filteredAccounts;
    const allSelected = targetAccounts.every(a => selectedAccounts.includes(a.id));
    if (allSelected) {
      setSelectedAccounts(prev => prev.filter(id => !targetAccounts.find(a => a.id === id)));
    } else {
      setSelectedAccounts(prev => {
        const newIds = targetAccounts.map(a => a.id).filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
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

      // Build parent → children map from the real parent_account_id hierarchy
      // (legacy catalogs may use code formats like 1101 -> 110101 without dots, so
      // string-based prefix matching is unreliable). This map powers consolidation
      // for parent accounts and stays format-agnostic.
      const accountsByParent = new Map<number, Account[]>();
      for (const account of accounts) {
        if (account.parent_account_id == null) continue;
        if (!accountsByParent.has(account.parent_account_id)) {
          accountsByParent.set(account.parent_account_id, []);
        }
        accountsByParent.get(account.parent_account_id)!.push(account);
      }

      const collectDescendants = (rootId: number): number[] => {
        const result: number[] = [];
        const visit = (id: number) => {
          result.push(id);
          for (const child of accountsByParent.get(id) ?? []) visit(child.id);
        };
        visit(rootId);
        return result;
      };

      // Per selected root: list of descendant account IDs (root included)
      const rootDescendants = new Map<number, number[]>();
      const allEffectiveIds = new Set<number>();
      for (const rootId of selectedAccounts) {
        const descs = collectDescendants(rootId);
        rootDescendants.set(rootId, descs);
        for (const d of descs) allEffectiveIds.add(d);
      }
      const effectiveAccountIds = Array.from(allEffectiveIds);

      // Use server-side RPC — all aggregation and opening balance computed in Postgres
      const { data: rpcRows, error: rpcError } = await supabase.rpc('get_ledger_detail', {
        p_enterprise_id: parseInt(currentEnterpriseId),
        p_account_ids: effectiveAccountIds,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      if (rpcError) throw rpcError;

      // Index rows and opening balances by account_id (RPC returns same opening_balance
      // on every row of an account; capture it once).
      const rowsByAccount = new Map<number, any[]>();
      const openingByAccount = new Map<number, number>();
      for (const row of rpcRows ?? []) {
        const accId = Number(row.account_id);
        if (!rowsByAccount.has(accId)) rowsByAccount.set(accId, []);
        rowsByAccount.get(accId)!.push(row);
        if (!openingByAccount.has(accId)) {
          openingByAccount.set(accId, Number(row.opening_balance ?? 0));
        }
      }

      const accountById = new Map<number, Account>(accounts.map(a => [a.id, a]));

      // Build ONE consolidated ledger per selected root (instead of one per descendant)
      const ledgers: AccountLedger[] = [];
      for (const rootId of selectedAccounts) {
        const rootAccount = accountById.get(rootId);
        if (!rootAccount) continue;

        const descendantIds = rootDescendants.get(rootId) ?? [rootId];
        const hasChildren = descendantIds.length > 1;

        // Consolidated opening balance = sum of every descendant's opening balance
        // (only descendants with movements are returned by the RPC; absent ones
        // contribute 0, matching prior behaviour).
        let previousBalance = 0;
        for (const did of descendantIds) {
          previousBalance += openingByAccount.get(did) ?? 0;
        }

        // Merge movements from all descendants into a single chronological stream
        const merged: any[] = [];
        for (const did of descendantIds) {
          const rows = rowsByAccount.get(did);
          if (rows) merged.push(...rows);
        }
        merged.sort((a, b) => {
          const da = String(a.entry_date), db = String(b.entry_date);
          if (da !== db) return da < db ? -1 : 1;
          const na = String(a.entry_number ?? ''), nb = String(b.entry_number ?? '');
          if (na !== nb) return na < nb ? -1 : 1;
          return Number(a.detail_id) - Number(b.detail_id);
        });

        let runningBalance = previousBalance;
        const entries: LedgerEntry[] = merged.map((row: any) => {
          const debit  = Number(row.debit_amount)  || 0;
          const credit = Number(row.credit_amount) || 0;
          runningBalance += debit - credit;
          const srcAcc = accountById.get(Number(row.account_id));
          const baseDescription = row.line_description || row.entry_description || "";
          const beneficiary = (row.beneficiary_name ?? "").toString().trim();
          const description = beneficiary
            ? `${baseDescription} - ${beneficiary}`
            : baseDescription;
          const docRefs: string[] = Array.isArray(row.document_references) ? row.document_references : [];
          const reference =
            (row.bank_reference && String(row.bank_reference).trim()) ||
            (docRefs.length > 0 ? docRefs.filter(Boolean).join(", ") : null);
          return {
            id: Number(row.detail_id),
            journal_entry_id: Number(row.journal_entry_id),
            entry_date: row.entry_date,
            entry_number: row.entry_number,
            description,
            debit_amount: debit,
            credit_amount: credit,
            balance: runningBalance,
            previous_balance: previousBalance,
            account_id: Number(row.account_id),
            source_account_code: srcAcc?.account_code,
            source_account_name: srcAcc?.account_name,
            currency_code: row.currency_code ?? null,
            exchange_rate: row.exchange_rate != null ? Number(row.exchange_rate) : null,
            original_debit: row.original_debit != null ? Number(row.original_debit) : null,
            original_credit: row.original_credit != null ? Number(row.original_credit) : null,
            reference: reference || null,
            beneficiary_name: beneficiary || null,
          };
        });

        const totalDebit  = entries.reduce((s, e) => s + e.debit_amount,  0);
        const totalCredit = entries.reduce((s, e) => s + e.credit_amount, 0);

        // Only include ledgers that have either movement or opening balance
        if (entries.length === 0 && Math.abs(previousBalance) < 0.005) continue;

        ledgers.push({
          account: rootAccount,
          entries,
          previousBalance,
          totalDebit,
          totalCredit,
          finalBalance: entries.length ? entries[entries.length - 1].balance : previousBalance,
          isConsolidated: hasChildren,
          descendantCount: descendantIds.length,
        });
      }

      if (ledgers.length === 0) {
        setAccountLedgers([]);
        toast({
          title: "Sin movimientos",
          description: "Las cuentas seleccionadas no tienen movimientos en el período",
        });
        setLoading(false);
        return;
      }

      ledgers.sort((a, b) => a.account.account_code.localeCompare(b.account.account_code));

      setAccountLedgers(ledgers);
      setExpandedAccounts(new Set(ledgers.map(l => l.account.id)));
      setReportGenerated(true);

      const totalMovements = ledgers.reduce((sum, l) => sum + l.entries.length, 0);
      toast({
        title: "Reporte generado",
        description: `Se encontraron ${totalMovements} movimientos en ${ledgers.length} cuenta(s)`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error al generar reporte",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const { consumePages } = useBookAuthorizations(currentEnterpriseId ? parseInt(currentEnterpriseId) : null);

  const buildExportOptions = () => {
    // If any ledger is consolidated we add a "Cuenta Origen" column so the audit trail is preserved.
    const anyConsolidated = accountLedgers.some(l => l.isConsolidated);
    const headers = anyConsolidated
      ? ["Fecha", "No. Partida", "Cuenta Origen", "Descripción", "Debe", "Haber", "Saldo"]
      : ["Fecha", "No. Partida", "Descripción", "Debe", "Haber", "Saldo"];
    const colCount = headers.length;
    const blankRow = Array(colCount).fill("");
    const data: any[][] = [];
    const boldRows: number[] = [];

    accountLedgers.forEach(ledger => {
      boldRows.push(data.length);
      const headerRow = [...blankRow];
      headerRow[0] = `CUENTA: ${ledger.account.account_code} - ${ledger.account.account_name}`;
      headerRow[colCount - 1] = `Saldo Anterior: ${formatCurrency(ledger.previousBalance)}`;
      data.push(headerRow);

      ledger.entries.forEach(entry => {
        if (anyConsolidated) {
          data.push([
            entry.entry_date,
            entry.entry_number,
            entry.source_account_code ? `${entry.source_account_code}` : "",
            entry.description,
            entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : "-",
            entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : "-",
            formatCurrency(Math.abs(entry.balance)),
          ]);
        } else {
          data.push([
            entry.entry_date,
            entry.entry_number,
            entry.description,
            entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : "-",
            entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : "-",
            formatCurrency(Math.abs(entry.balance)),
          ]);
        }
      });

      boldRows.push(data.length);
      const totalsRow = [...blankRow];
      totalsRow[colCount - 4] = "TOTALES:";
      totalsRow[colCount - 3] = formatCurrency(ledger.totalDebit);
      totalsRow[colCount - 2] = formatCurrency(ledger.totalCredit);
      totalsRow[colCount - 1] = formatCurrency(Math.abs(ledger.finalBalance));
      data.push(totalsRow);
      data.push([...blankRow]);
    });

    return {
      filename: `Libro_Mayor_${startDate}_${endDate}`,
      title: `Libro Mayor - Del ${startDate} al ${endDate}`,
      enterpriseName,
      headers,
      data,
      boldRows,
    };
  };

  // Build the structured payload consumed by the new legal-format ledger PDF renderer.
  const buildLedgerPdfInput = (descriptionMode: "full" | "short" | "none" = "full",
                               folioOptions?: { includeFolio: boolean; startingFolio: number },
                               authorizationLegend?: { number: string; date: string }) => ({
    enterpriseName,
    periodStart: startDate,
    periodEnd: endDate,
    descriptionMode,
    folioOptions,
    authorizationLegend,
    ledgers: accountLedgers.map((l) => ({
      account_code: l.account.account_code,
      account_name: l.account.account_name,
      previousBalance: l.previousBalance,
      totalDebit: l.totalDebit,
      totalCredit: l.totalCredit,
      finalBalance: l.finalBalance,
      isConsolidated: l.isConsolidated,
      entries: l.entries.map((e) => ({
        entry_date: e.entry_date,
        entry_number: e.entry_number,
        description: e.description,
        debit_amount: e.debit_amount,
        credit_amount: e.credit_amount,
        balance: e.balance,
        source_account_code: e.source_account_code,
        source_account_name: e.source_account_name,
        reference: e.reference ?? null,
      })),
    })),
  });

  const handleExport = async (options: FolioExportOptions) => {
    if (accountLedgers.length === 0) return;

    if (options.format === 'excel') {
      exportToExcel(buildExportOptions());
    } else {
      const { renderLegalLedgerPdf } = await import("@/utils/ledgerPdfFormats");
      const { doc, pageCount } = renderLegalLedgerPdf(
        buildLedgerPdfInput(
          options.descriptionMode ?? "full",
          { includeFolio: options.includeFolio, startingFolio: options.startingFolio },
          options.authorization
            ? { number: options.authorization.number, date: options.authorization.date }
            : undefined,
        ),
      );
      doc.save(`Libro_Mayor_${startDate}_${endDate}.pdf`);

      if (options.authorization && pageCount) {
        await consumePages(options.authorization.id, pageCount, {
          enterpriseId: options.authorization.enterpriseId,
          bookType: options.authorization.bookType,
          reportPeriod: `Libro Mayor ${startDate} a ${endDate}`,
          dateFrom: startDate,
          dateTo: endDate,
        });
      }
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
      <ReportCurrencySelector
        enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : null}
        value={currencyView}
        onChange={setCurrencyView}
      />

      {currencyView.mode !== "FUNCTIONAL" && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Vista multi-moneda en preparación. Los montos se siguen mostrando en moneda funcional;
            la próxima iteración añadirá las columnas de moneda original ({currencyView.foreignCode ?? "—"}).
          </AlertDescription>
        </Alert>
      )}

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
            <PopoverContent className="w-[400px] p-0 bg-popover" align="start" side="bottom" sideOffset={4}>
              <div className="p-2 border-b space-y-2">
                <Input
                  placeholder="Buscar cuenta (código o nombre)..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <div className="flex flex-wrap gap-1">
                  <Button
                    variant={levelFilter === null ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setLevelFilter(null)}
                  >
                    Todas
                  </Button>
                  {accountLevels.map(level => (
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
                <div className="flex items-center space-x-2 px-2 py-1">
                  <Checkbox
                    id="select-all"
                    checked={searchedAccounts.length > 0 && searchedAccounts.every(a => selectedAccounts.includes(a.id))}
                    onCheckedChange={() => {
                      const allSelected = searchedAccounts.every(a => selectedAccounts.includes(a.id));
                      if (allSelected) {
                        setSelectedAccounts(prev => prev.filter(id => !searchedAccounts.find(a => a.id === id)));
                      } else {
                        setSelectedAccounts(prev => {
                          const newIds = searchedAccounts.map(a => a.id).filter(id => !prev.includes(id));
                          return [...prev, ...newIds];
                        });
                      }
                    }}
                  />
                  <label
                    htmlFor="select-all"
                    className="text-sm font-medium leading-none cursor-pointer"
                  >
                    Seleccionar todas {levelFilter !== null ? `(Nivel ${levelFilter})` : accountSearch ? '(filtradas)' : ''}
                  </label>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto p-2">
                <div className="space-y-1">
                  {searchedAccounts.length === 0 && (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No se encontraron cuentas
                    </div>
                  )}
                  {searchedAccounts.map((account) => (
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
        bookType="libro_mayor"
        enterpriseId={currentEnterpriseId ? parseInt(currentEnterpriseId) : undefined}
        showDescriptionMode
        estimatePageCount={accountLedgers.length === 0 ? undefined : async () => {
          const { renderLegalLedgerPdf } = await import("@/utils/ledgerPdfFormats");
          const { pageCount } = renderLegalLedgerPdf(buildLedgerPdfInput("full"));
          return pageCount;
        }}
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
                          CUENTA: {ledger.account.account_code} - {ledger.account.account_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Período: {startDate} a {endDate} • {ledger.entries.length} movimiento(s)
                          {ledger.isConsolidated && (
                            <> • Consolidado de {ledger.descendantCount} cuentas hijas</>
                          )}
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
                  {ledger.entries.length > 0 ? (() => {
                    const showForeign = ledger.entries.some(
                      (e) => e.currency_code && e.currency_code !== "GTQ" && ((e.original_debit ?? 0) > 0 || (e.original_credit ?? 0) > 0)
                    );
                    return (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[120px]">Fecha</TableHead>
                          <TableHead className="w-[150px]">No. Partida</TableHead>
                          {ledger.isConsolidated && (
                            <TableHead className="w-[140px]" title="Cuenta hija donde se originó el movimiento">
                              Cuenta Origen
                            </TableHead>
                          )}
                          <TableHead className="min-w-[250px]">Descripción</TableHead>
                          {showForeign && (
                            <TableHead className="w-[160px] text-right" title="Monto en la moneda original de la transacción">
                              Moneda original
                            </TableHead>
                          )}
                          <TableHead className="w-[120px] text-right">Debe</TableHead>
                          <TableHead className="w-[120px] text-right">Haber</TableHead>
                          <TableHead className="w-[120px] text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.entries.map((entry) => (
                          <TableRow key={`${entry.account_id}-${entry.id}`} className="group">
                            <TableCell>{entry.entry_date}</TableCell>
                            <TableCell className="text-sm">
                              <EntityLink
                                type="journal_entry"
                                label={entry.entry_number}
                                id={entry.journal_entry_id}
                                secondaryLabel={entry.description}
                              />
                            </TableCell>
                            {ledger.isConsolidated && (
                              <TableCell className="text-xs font-mono" title={entry.source_account_name}>
                                {entry.source_account_code}
                              </TableCell>
                            )}
                            <TableCell><TruncatedText text={entry.description} inline /></TableCell>
                            {showForeign && (
                              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                {entry.currency_code && entry.currency_code !== "GTQ" && ((entry.original_debit ?? 0) > 0 || (entry.original_credit ?? 0) > 0) ? (
                                  <>
                                    <div>{entry.currency_code} {formatCurrency((entry.original_debit ?? 0) || (entry.original_credit ?? 0))}</div>
                                    {entry.exchange_rate != null && (
                                      <div className="text-[10px] opacity-70">TC {Number(entry.exchange_rate).toFixed(4)}</div>
                                    )}
                                  </>
                                ) : "-"}
                              </TableCell>
                            )}
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
                    );
                  })() : (
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

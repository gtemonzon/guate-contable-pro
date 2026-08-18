import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/truncated-text";
import { supabase } from "@/integrations/supabase/client";
import { getFiscalFloorDate } from "@/utils/fiscalFloor";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import JournalEntryViewDialog from "@/components/partidas/JournalEntryViewDialog";

interface LedgerRow {
  entry_date: string;
  entry_number: string;
  journal_entry_id: number;
  description: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
}

interface AccountLedgerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number | null;
  /** When provided, query all these IDs (for consolidated/parent account view) */
  accountIds?: number[];
  accountCode: string;
  accountName: string;
  enterpriseId: number | null;
  /** For balance sheet: start of time → asOfDate */
  startDate?: string;
  endDate: string;
  /** Show a "Ver reporte completo" link in the header (default false) */
  showFullReportLink?: boolean;
  /** Scroll to and temporarily highlight the rows of this journal entry */
  highlightEntryId?: number | null;
  /** Date of the originating entry, enables the month toggle */
  entryDate?: string;
  /** Show the "Mes de la partida" / "Período completo" toggle (default false) */
  allowMonthToggle?: boolean;
}

const formatQ = (amount: number) =>
  `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AccountLedgerDrawer({
  open,
  onOpenChange,
  accountId,
  accountIds,
  accountCode,
  accountName,
  enterpriseId,
  startDate,
  endDate,
  showFullReportLink = false,
  highlightEntryId,
  entryDate,
  allowMonthToggle = false,
}: AccountLedgerDrawerProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);
  const [scope, setScope] = useState<'period' | 'month'>('period');
  const [highlightActive, setHighlightActive] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const firstHighlightRef = useRef<HTMLTableRowElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const resolvedIds = accountIds && accountIds.length > 0 ? accountIds : (accountId ? [accountId] : []);
  const isConsolidated = resolvedIds.length > 1;

  const monthToggleEnabled = allowMonthToggle && !!entryDate;

  // Effective range depending on scope
  let effectiveStartDate = startDate;
  let effectiveEndDate = endDate;
  if (monthToggleEnabled && scope === 'month' && entryDate) {
    const d = new Date(entryDate + 'T00:00:00');
    const y = d.getFullYear();
    const m = d.getMonth();
    const pad = (n: number) => String(n).padStart(2, '0');
    effectiveStartDate = `${y}-${pad(m + 1)}-01`;
    const last = new Date(y, m + 1, 0);
    effectiveEndDate = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  }

  useEffect(() => {
    if (!open) setScope('period');
    setScrolled(false);
  }, [open, accountId, JSON.stringify(accountIds)]);

  useEffect(() => {
    if (open && resolvedIds.length > 0 && enterpriseId) {
      fetchLedger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId, JSON.stringify(accountIds), enterpriseId, effectiveStartDate, effectiveEndDate]);

  // Scroll to + highlight the originating entry once rows are loaded
  useEffect(() => {
    if (!open || loading || !highlightEntryId || rows.length === 0) return;
    if (!rows.some(r => r.journal_entry_id === highlightEntryId)) return;
    setHighlightActive(true);
    const scrollTimer = setTimeout(() => {
      firstHighlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    const clearTimer = setTimeout(() => setHighlightActive(false), 2600);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [open, loading, rows, highlightEntryId]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 40);
  };

  const fetchLedger = async () => {
    if (resolvedIds.length === 0 || !enterpriseId) return;
    setLoading(true);
    try {
      // Determine fiscal floor: use the most recent apertura entry as lower bound
      const startRef = effectiveStartDate || effectiveEndDate;
      const fiscalFloor = await getFiscalFloorDate(enterpriseId, startRef);

      const lowerBound = effectiveStartDate || fiscalFloor || null;

      // Opening balance: everything posted strictly before the effective start
      let openingBalance = 0;
      if (lowerBound) {
        const prevData = await fetchAllRecords<any>(() =>
          supabase
            .from("tab_journal_entry_details")
            .select(`
              debit_amount,
              credit_amount,
              tab_journal_entries!inner (
                status,
                is_posted,
                entry_date
              )
            `)
            .in("account_id", resolvedIds)
            .eq("tab_journal_entries.is_posted", true)
            .eq("tab_journal_entries.enterprise_id", enterpriseId)
            .is("tab_journal_entries.reversal_entry_id", null)
            .is("tab_journal_entries.reversed_by_entry_id", null)
            .lt("tab_journal_entries.entry_date", lowerBound)
        );

        openingBalance = (prevData || []).reduce(
          (sum: number, r: any) => sum + (Number(r.debit_amount) || 0) - (Number(r.credit_amount) || 0),
          0
        );
      }

      // Get all detail lines for the account(s) within the date range, from posted entries only
      const buildQuery = () => {
        const q = supabase
          .from("tab_journal_entry_details")
          .select(`
            debit_amount,
            credit_amount,
            description,
            journal_entry_id,
            account_id,
            tab_journal_entries!inner (
              id,
              entry_number,
              entry_date,
              description,
              status,
              is_posted
            )
          `)
          .in("account_id", resolvedIds)
          .eq("tab_journal_entries.is_posted", true)
          .eq("tab_journal_entries.enterprise_id", enterpriseId)
          .is("tab_journal_entries.reversal_entry_id", null)
          .is("tab_journal_entries.reversed_by_entry_id", null)
          .lte("tab_journal_entries.entry_date", effectiveEndDate)
          .order("tab_journal_entries(entry_date)", { ascending: true });

        if (lowerBound) {
          q.gte("tab_journal_entries.entry_date", lowerBound);
        }
        return q;
      };

      const data = await fetchAllRecords<any>(buildQuery);

      let runningBalance = openingBalance;
      const ledgerRows: LedgerRow[] = (data || []).map((row: any) => {
        const debit = Number(row.debit_amount) || 0;
        const credit = Number(row.credit_amount) || 0;
        runningBalance += debit - credit;
        return {
          entry_date: row.tab_journal_entries.entry_date,
          entry_number: row.tab_journal_entries.entry_number,
          journal_entry_id: row.tab_journal_entries.id,
          description: row.description || row.tab_journal_entries.description || '',
          debit_amount: debit,
          credit_amount: credit,
          running_balance: runningBalance,
        };
      });

      setRows(ledgerRows);
    } catch (err) {
      console.error("Error fetching ledger:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };


  const safeFmt = (d: string | undefined) => {
    if (!d) return '';
    try {
      const date = new Date(d + 'T00:00:00');
      if (isNaN(date.getTime())) return d;
      return format(date, 'dd/MM/yyyy', { locale: es });
    } catch { return d; }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl overflow-hidden flex flex-col p-0">
          {/* Sticky collapsible header */}
          <div
            className={cn(
              "sticky top-0 z-20 flex flex-col px-6 pt-6 transition-all duration-200",
              scrolled
                ? "pb-3 bg-background/95 backdrop-blur-sm border-b shadow-sm"
                : "pb-0 bg-transparent"
            )}
          >
            {!scrolled ? (
              <SheetHeader className="pb-4">
                <SheetTitle className="text-left flex items-center justify-between gap-2">
                  <span>
                    <span className="text-primary font-mono">{accountCode}</span>
                    <span className="ml-2">{accountName}</span>
                  </span>
                  <span className="flex items-center gap-2 mr-6 shrink-0">
                    {monthToggleEnabled && (
                      <span className="inline-flex rounded-md border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setScope('period')}
                          className={cn(
                            "px-2 py-1 text-xs transition-colors",
                            scope === 'period' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                          )}
                        >
                          Período completo
                        </button>
                        <button
                          type="button"
                          onClick={() => setScope('month')}
                          className={cn(
                            "px-2 py-1 text-xs transition-colors border-l",
                            scope === 'month' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                          )}
                        >
                          Mes de la partida
                        </button>
                      </span>
                    )}
                    {showFullReportLink && accountId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 shrink-0"
                        onClick={() => {
                          let url = `/reportes?tab=mayor&accountId=${accountId}`;
                          if (effectiveStartDate) url += `&startDate=${effectiveStartDate}`;
                          if (effectiveEndDate) url += `&endDate=${effectiveEndDate}`;
                          navigate(url);
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver reporte completo
                      </Button>
                    )}
                  </span>
                </SheetTitle>
                <p className="text-sm text-muted-foreground">
                  {isConsolidated ? 'Mayor de cuenta consolidado' : 'Mayor de cuenta'}{' '}
                  {effectiveStartDate ? `del ${safeFmt(effectiveStartDate)} ` : ''}
                  al {safeFmt(effectiveEndDate)}
                </p>
              </SheetHeader>
            ) : (
              <div className="space-y-1">
                <div className="flex items-start gap-2 mr-6">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-primary font-mono text-sm shrink-0">{accountCode}</span>
                    <span className="text-sm font-medium truncate" title={accountName}>{accountName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 pt-0.5">
                    {effectiveStartDate ? `${safeFmt(effectiveStartDate)} - ` : ''}
                    {safeFmt(effectiveEndDate)}
                  </span>
                </div>
                {(monthToggleEnabled || (showFullReportLink && accountId)) && (
                  <div className="flex items-center justify-end gap-2">
                    {monthToggleEnabled && (
                      <span className="inline-flex rounded-md border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setScope('period')}
                          className={cn(
                            "px-2 py-0.5 text-[11px] transition-colors",
                            scope === 'period' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                          )}
                        >
                          Período completo
                        </button>
                        <button
                          type="button"
                          onClick={() => setScope('month')}
                          className={cn(
                            "px-2 py-0.5 text-[11px] transition-colors border-l",
                            scope === 'month' ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                          )}
                        >
                          Mes de la partida
                        </button>
                      </span>
                    )}
                    {showFullReportLink && accountId && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] gap-1 shrink-0"
                        onClick={() => {
                          let url = `/reportes?tab=mayor&accountId=${accountId}`;
                          if (effectiveStartDate) url += `&startDate=${effectiveStartDate}`;
                          if (effectiveEndDate) url += `&endDate=${effectiveEndDate}`;
                          navigate(url);
                        }}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver reporte completo
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scrollable body */}
          <div
            ref={contentRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-6 pb-6"
          >
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                No hay movimientos en este período
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">Fecha</TableHead>
                      <TableHead className="w-[100px]">Partida</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right w-[110px]">Debe</TableHead>
                      <TableHead className="text-right w-[110px]">Haber</TableHead>
                      <TableHead className="text-right w-[120px]">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => {
                      const isTarget = !!highlightEntryId && row.journal_entry_id === highlightEntryId;
                      const isFirstTarget =
                        isTarget && rows.findIndex(r => r.journal_entry_id === highlightEntryId) === idx;
                      return (
                      <TableRow
                        key={idx}
                        ref={isFirstTarget ? firstHighlightRef : undefined}
                        className={cn(isTarget && highlightActive && "ring-2 ring-primary bg-accent/20")}
                      >

                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {safeFmt(row.entry_date)}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => setViewEntryId(row.journal_entry_id)}
                            className="text-primary hover:underline font-mono text-xs flex items-center gap-1"
                          >
                            {row.entry_number}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </TableCell>
                        <TableCell className="text-xs max-w-[250px]">
                          <TruncatedText text={row.description} className="text-xs" inline />
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                          {row.debit_amount > 0 ? formatQ(row.debit_amount) : ''}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                          {row.credit_amount > 0 ? formatQ(row.credit_amount) : ''}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap font-semibold">
                          {formatQ(row.running_balance)}
                        </TableCell>
                      </TableRow>
                      );
                    })}

                  </TableBody>
                </Table>
                <div className="mt-4 pt-3 border-t border-border flex justify-between text-sm font-mono font-bold">
                  <span>Totales:</span>
                  <div className="flex gap-6">
                    <span>Debe: {formatQ(rows.reduce((s, r) => s + r.debit_amount, 0))}</span>
                    <span>Haber: {formatQ(rows.reduce((s, r) => s + r.credit_amount, 0))}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <JournalEntryViewDialog
        open={viewEntryId !== null}
        onOpenChange={(o) => { if (!o) setViewEntryId(null); }}
        entryId={viewEntryId}
      />
    </>
  );
}

import { useState, useEffect } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
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
}: AccountLedgerDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);

  const resolvedIds = accountIds && accountIds.length > 0 ? accountIds : (accountId ? [accountId] : []);
  const isConsolidated = resolvedIds.length > 1;

  useEffect(() => {
    if (open && resolvedIds.length > 0 && enterpriseId) {
      fetchLedger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountId, JSON.stringify(accountIds), enterpriseId, startDate, endDate]);

  const fetchLedger = async () => {
    if (resolvedIds.length === 0 || !enterpriseId) return;
    setLoading(true);
    try {
      // Get all detail lines for the account(s) within the date range, from posted entries only
      const query = supabase
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
        .lte("tab_journal_entries.entry_date", endDate)
        .order("tab_journal_entries(entry_date)", { ascending: true });

      if (startDate) {
        query.gte("tab_journal_entries.entry_date", startDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      let runningBalance = 0;
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
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-left">
              <span className="text-primary font-mono">{accountCode}</span>
              <span className="ml-2">{accountName}</span>
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              {isConsolidated ? 'Mayor de cuenta consolidado' : 'Mayor de cuenta'}{' '}
              {startDate ? `del ${safeFmt(startDate)} ` : ''}
              al {safeFmt(endDate)}
            </p>
          </SheetHeader>

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
                  {rows.map((row, idx) => (
                    <TableRow key={idx}>
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
                  ))}
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

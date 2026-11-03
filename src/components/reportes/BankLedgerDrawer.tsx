import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TruncatedText } from "@/components/ui/truncated-text";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ledgerEntryNotice } from "@/utils/ledgerEntryNotice";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import JournalEntryViewDialog from "@/components/partidas/JournalEntryViewDialog";
import {
  STATUS_LABELS,
  STATUS_VARIANT,
  fetchBankLedger,
  fetchSuggestedOpeningBalance,
  withRunningBalance,
  type BankDocRow,
} from "@/services/bankLedger";

interface BankLedgerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cuenta contable del banco (tab_accounts.id) */
  bankAccountId: number | null;
  accountCode: string;
  accountName: string;
  enterpriseId: number | null;
  /** Inicio del rango; sin él se usa el 1 de enero del año de `endDate` */
  startDate?: string;
  endDate: string;
  /** Botón "Ver reporte completo" en el encabezado (false por omisión) */
  showFullReportLink?: boolean;
  /** Resalta y lleva a la vista las filas de esta partida */
  highlightEntryId?: number | null;
  /** Estado de la partida de origen: muestra un aviso si no está contabilizada */
  highlightEntryStatus?: string | null;
  /** Fecha de la partida de origen; habilita el conmutador de mes */
  entryDate?: string;
  /** Conmutador "Período completo" / "Mes de la partida" (false por omisión) */
  allowMonthToggle?: boolean;
}

const formatQ = (amount: number) =>
  `Q ${amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const safeFmt = (d: string | undefined) => {
  if (!d) return "";
  try {
    const date = new Date(d + "T00:00:00");
    if (isNaN(date.getTime())) return d;
    return format(date, "dd/MM/yyyy", { locale: es });
  } catch { return d; }
};

/**
 * Libro de bancos de una cuenta en un cajón lateral (desde el detalle de partida).
 * Usa las mismas consultas y cálculos que el reporte Libro de Bancos (services/bankLedger).
 */
export default function BankLedgerDrawer({
  open,
  onOpenChange,
  bankAccountId,
  accountCode,
  accountName,
  enterpriseId,
  startDate,
  endDate,
  showFullReportLink = false,
  highlightEntryId,
  highlightEntryStatus,
  entryDate,
  allowMonthToggle = false,
}: BankLedgerDrawerProps) {
  const entryNotice = ledgerEntryNotice(highlightEntryStatus, "bancos");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BankDocRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [viewEntryId, setViewEntryId] = useState<number | null>(null);
  const [scope, setScope] = useState<"period" | "month">("period");
  const [highlightActive, setHighlightActive] = useState(false);
  const firstHighlightRef = useRef<HTMLTableRowElement | null>(null);

  const monthToggleEnabled = allowMonthToggle && !!entryDate;

  // Rango efectivo según el conmutador (igual que el mayor)
  let effectiveStartDate = startDate || (endDate ? `${endDate.slice(0, 4)}-01-01` : "");
  let effectiveEndDate = endDate;
  if (monthToggleEnabled && scope === "month" && entryDate) {
    const d = new Date(entryDate + "T00:00:00");
    const y = d.getFullYear();
    const m = d.getMonth();
    const pad = (n: number) => String(n).padStart(2, "0");
    effectiveStartDate = `${y}-${pad(m + 1)}-01`;
    const last = new Date(y, m + 1, 0);
    effectiveEndDate = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
  }

  useEffect(() => {
    if (!open) setScope("period");
  }, [open, bankAccountId]);

  useEffect(() => {
    if (!open || !bankAccountId || !enterpriseId || !effectiveStartDate || !effectiveEndDate) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const range = { enterpriseId, bankGlAccountId: bankAccountId };
      try {
        const [ledgerRows, opening] = await Promise.all([
          fetchBankLedger({ ...range, dateFrom: effectiveStartDate, dateTo: effectiveEndDate, statusFilter: "ALL" }),
          // Como en el reporte: si falla el saldo sugerido, se queda en 0.
          fetchSuggestedOpeningBalance({ ...range, dateFrom: effectiveStartDate }).catch(() => 0),
        ]);
        if (cancelled) return;
        setRows(ledgerRows);
        setOpeningBalance(opening);
      } catch (err) {
        console.error("Error fetching bank ledger:", err);
        if (cancelled) return;
        setRows([]);
        setOpeningBalance(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, bankAccountId, enterpriseId, effectiveStartDate, effectiveEndDate]);

  // Lleva a la vista y resalta la partida de origen cuando cargan las filas
  useEffect(() => {
    if (!open || loading || !highlightEntryId || rows.length === 0) return;
    if (!rows.some(r => r.journal_entry_id === highlightEntryId)) return;
    setHighlightActive(true);
    const scrollTimer = setTimeout(() => {
      firstHighlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const clearTimer = setTimeout(() => setHighlightActive(false), 2600);
    return () => { clearTimeout(scrollTimer); clearTimeout(clearTimer); };
  }, [open, loading, rows, highlightEntryId]);

  const rowsWithBalance = withRunningBalance(rows, openingBalance);
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const finalBalance = openingBalance + totalDebit - totalCredit;
  const firstHighlightIdx = highlightEntryId
    ? rowsWithBalance.findIndex(r => r.journal_entry_id === highlightEntryId)
    : -1;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl overflow-hidden flex flex-col p-0">
          {/* Encabezado fijo */}
          <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
            <SheetTitle className="text-left flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="text-primary font-mono">{accountCode}</span>
                <span className="ml-2">{accountName}</span>
              </span>
              <span className="flex items-center gap-2 mr-6 shrink-0">
                {monthToggleEnabled && (
                  <span className="inline-flex rounded-md border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setScope("period")}
                      className={cn(
                        "px-2 py-1 text-xs transition-colors",
                        scope === "period" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      Período completo
                    </button>
                    <button
                      type="button"
                      onClick={() => setScope("month")}
                      className={cn(
                        "px-2 py-1 text-xs transition-colors border-l",
                        scope === "month" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      Mes de la partida
                    </button>
                  </span>
                )}
                {showFullReportLink && bankAccountId && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1 shrink-0"
                    onClick={() =>
                      navigate(
                        `/reportes?tab=bancos&bankAccountId=${bankAccountId}&dateFrom=${effectiveStartDate}&dateTo=${effectiveEndDate}`
                      )
                    }
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver reporte completo
                  </Button>
                )}
              </span>
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Libro de bancos del {safeFmt(effectiveStartDate)} al {safeFmt(effectiveEndDate)}
            </p>
          </SheetHeader>

          {/* Cuerpo con scroll */}
          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
            {entryNotice && (
              <Alert className="mb-4 border-warning/40 bg-warning/10">
                <AlertTriangle className="h-4 w-4 !text-warning" />
                <AlertDescription>{entryNotice}</AlertDescription>
              </Alert>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Sin movimientos registrados en este período
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[85px] text-xs">Fecha</TableHead>
                      <TableHead className="w-[90px] text-xs">Doc #</TableHead>
                      <TableHead className="text-xs">Beneficiario y concepto</TableHead>
                      <TableHead className="text-right w-[105px] text-xs">Debe</TableHead>
                      <TableHead className="text-right w-[105px] text-xs">Haber</TableHead>
                      <TableHead className="text-right w-[115px] text-xs">Saldo</TableHead>
                      <TableHead className="text-center w-[95px] text-xs">Estado</TableHead>
                      <TableHead className="w-[100px] text-xs">Partida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/50 font-medium">
                      <TableCell colSpan={5} className="text-right text-xs">Saldo inicial</TableCell>
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">{formatQ(openingBalance)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>

                    {rowsWithBalance.map((r, idx) => {
                      const isTarget = !!highlightEntryId && r.journal_entry_id === highlightEntryId;
                      return (
                        <TableRow
                          key={idx}
                          ref={idx === firstHighlightIdx ? firstHighlightRef : undefined}
                          className={cn(
                            r.status === "VOID" && "opacity-60 line-through decoration-destructive/40",
                            isTarget && highlightActive && "ring-2 ring-primary bg-accent/20"
                          )}
                        >
                          <TableCell className="font-mono text-xs whitespace-nowrap">{safeFmt(r.date)}</TableCell>
                          <TableCell className="font-mono text-xs">{r.document_number}</TableCell>
                          <TableCell className="text-xs max-w-[220px]">
                            <TruncatedText text={r.beneficiary || "—"} maxLength={40} className="text-xs font-medium" />
                            <TruncatedText text={r.concept || "—"} maxLength={50} className="text-[11px] text-muted-foreground" />
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                            {r.debit > 0 ? formatQ(r.debit) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                            {r.credit > 0 ? formatQ(r.credit) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs whitespace-nowrap font-semibold">
                            {formatQ(r.runningBalance)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={STATUS_VARIANT[r.status] || "secondary"} className="text-[10px]">
                              {STATUS_LABELS[r.status] || r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.journal_entry_id ? (
                              <button
                                type="button"
                                onClick={() => setViewEntryId(r.journal_entry_id)}
                                className="text-primary hover:underline font-mono text-xs flex items-center gap-1"
                              >
                                {r.journal_entry_number || r.journal_entry_id}
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            ) : (
                              <span className="font-mono">{r.journal_entry_number || "—"}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell colSpan={3} className="text-right text-xs">Totales:</TableCell>
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">{formatQ(totalDebit)}</TableCell>
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">{formatQ(totalCredit)}</TableCell>
                      <TableCell className="text-right font-mono text-xs whitespace-nowrap">{formatQ(finalBalance)}</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableBody>
                </Table>
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

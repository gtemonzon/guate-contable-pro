import { useState, useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { Separator } from "@/components/ui/separator";
import { AlertCircle, ChevronDown, TrendingUp, TrendingDown, Minus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, cn } from "@/lib/utils";

interface AccountBalanceInspectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number | null;
  accountCode: string;
  accountName: string;
  balanceType: string | null;
  entryDate: string;     // YYYY-MM-DD
  enterpriseId: number;
}

interface LedgerRow {
  opening_balance_year: number;
  detail_id: number;
  entry_date: string;
  entry_number: string;
  entry_description: string;
  line_description: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
  entry_status: string;
  total_rows: number;
}

const PAGE_SIZE = 200;

export function AccountBalanceInspector({
  open,
  onOpenChange,
  accountId,
  accountCode,
  accountName,
  balanceType,
  entryDate,
  enterpriseId,
}: AccountBalanceInspectorProps) {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [totalRows, setTotalRows] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);

  const year = entryDate ? parseInt(entryDate.split("-")[0]) : new Date().getFullYear();

  const fetchData = useCallback(async (resetOffset = true) => {
    if (!accountId || !enterpriseId || !entryDate) return;
    const currentOffset = resetOffset ? 0 : offset;
    if (resetOffset) setOffset(0);
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("get_account_ledger_as_of", {
        p_enterprise_id:  enterpriseId,
        p_account_id:     accountId,
        p_as_of_date:     entryDate,
        p_year:           year,
        p_include_drafts: includeDrafts,
        p_limit:          PAGE_SIZE,
        p_offset:         currentOffset,
      });
      if (rpcError) throw rpcError;
      const fetched = (data as LedgerRow[]) || [];
      if (resetOffset) {
        setRows(fetched);
      } else {
        setRows(prev => [...prev, ...fetched]);
      }
      if (fetched.length > 0) {
        setTotalRows(fetched[0].total_rows);
        setOpeningBalance(fetched[0].opening_balance_year);
      } else {
        setTotalRows(0);
      }
    } catch (e: unknown) {
      setError(e.message || "Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [accountId, enterpriseId, entryDate, year, includeDrafts, offset]);

  // Load when modal opens or filters change
  useEffect(() => {
    if (open && accountId) fetchData(true);
  }, [open, accountId, includeDrafts]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setRows([]); setSearch(""); setOffset(0); setTotalRows(0); setError(null);
    }
  }, [open]);

  const loadMore = () => {
    const newOffset = offset + PAGE_SIZE;
    setOffset(newOffset);
    fetchData(false);
  };

  // Filtered rows (client-side search within loaded data)
  const filteredRows = search.trim()
    ? rows.filter(r =>
        r.entry_number.toLowerCase().includes(search.toLowerCase()) ||
        (r.entry_description || "").toLowerCase().includes(search.toLowerCase()) ||
        (r.line_description  || "").toLowerCase().includes(search.toLowerCase())
      )
    : rows;

  // Footer totals
  const totalDebit  = rows.reduce((s, r) => s + r.debit_amount,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit_amount, 0);
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].running_balance : openingBalance;

  const balanceBadge = () => {
    if (balanceType === "deudor")    return <Badge variant="outline" className="text-blue-600 border-blue-300">Naturaleza Deudora</Badge>;
    if (balanceType === "acreedor")  return <Badge variant="outline" className="text-purple-600 border-purple-300">Naturaleza Acreedora</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">Indiferente</Badge>;
  };

  const balanceColor = (balance: number) => {
    if (balance > 0) return "text-emerald-600 dark:text-emerald-400";
    if (balance < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const BalanceTrend = ({ value }: { value: number }) => {
    if (value > 0) return <TrendingUp className="h-3.5 w-3.5 text-emerald-500 inline ml-1" />;
    if (value < 0) return <TrendingDown className="h-3.5 w-3.5 text-destructive inline ml-1" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground inline ml-1" />;
  };

  const formattedDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric" });

  const statusLabel: Record<string, string> = {
    borrador: "Borrador",
    pendiente_revision: "Pendiente",
    aprobado: "Aprobado",
    contabilizado: "Contabilizado",
    rechazado: "Rechazado",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1100px] h-[90vh] max-h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-lg font-bold">
                {accountCode} — {accountName}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                Saldo a fecha de partida:{" "}
                <span className="font-medium text-foreground">
                  {entryDate
                    ? formattedDate(entryDate)
                    : "—"}{" "}
                  · Año {year}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {balanceBadge()}
              <span className={cn("text-xl font-bold tabular-nums", balanceColor(closingBalance))}>
                {formatCurrency(closingBalance)}
                <BalanceTrend value={closingBalance} />
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b bg-muted/30">
          <Input
            placeholder="Buscar por número, descripción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 w-56 text-sm"
          />
          <div className="flex items-center gap-2">
            <Switch
              id="include-drafts"
              checked={includeDrafts}
              onCheckedChange={setIncludeDrafts}
            />
            <Label htmlFor="include-drafts" className="text-sm cursor-pointer">
              Incluir borradores
            </Label>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchData(true)}
            disabled={loading}
            className="h-8 gap-1"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualizar
          </Button>
          {totalRows > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">
              {Math.min(rows.length, filteredRows.length)} de {totalRows} movimientos
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {error ? (
            <div className="flex items-center gap-2 p-6 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          ) : loading && rows.length === 0 ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[90px]">Fecha</TableHead>
                    <TableHead className="w-[110px]">Partida #</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-[80px] text-xs text-muted-foreground">Estado</TableHead>
                    <TableHead className="w-[110px] text-right">Debe</TableHead>
                    <TableHead className="w-[110px] text-right">Haber</TableHead>
                    <TableHead className="w-[120px] text-right font-semibold">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening balance row */}
                  <TableRow className="bg-muted/40 border-l-4 border-l-muted-foreground/30">
                    <TableCell colSpan={4} className="py-1.5 text-xs text-muted-foreground font-medium">
                      Saldo inicial al 1 de enero de {year}
                    </TableCell>
                    <TableCell colSpan={2} />
                    <TableCell className={cn("py-1.5 text-right text-xs font-mono font-semibold", balanceColor(openingBalance))}>
                      {formatCurrency(openingBalance)}
                    </TableCell>
                  </TableRow>

                  {filteredRows.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                        No hay movimientos para este período.
                      </TableCell>
                    </TableRow>
                  )}

                  {filteredRows.map((row) => (
                    <TableRow key={row.detail_id} className="text-sm">
                      <TableCell className="py-1 text-xs tabular-nums">
                        {formattedDate(row.entry_date)}
                      </TableCell>
                      <TableCell className="py-1 font-mono text-xs text-primary">
                        {row.entry_number}
                      </TableCell>
                      <TableCell className="py-1">
                        <span className="font-medium text-xs">{row.entry_description}</span>
                        {row.line_description && row.line_description !== row.entry_description && (
                          <span className="text-muted-foreground text-xs block">{row.line_description}</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1">
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1 py-0",
                            row.entry_status === "contabilizado" ? "border-emerald-300 text-emerald-600" :
                            row.entry_status === "borrador"      ? "border-yellow-300 text-yellow-600" :
                            "border-border text-muted-foreground"
                          )}
                        >
                          {statusLabel[row.entry_status] || row.entry_status}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn("py-1 text-right font-mono text-xs", row.debit_amount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {row.debit_amount > 0 ? formatCurrency(row.debit_amount) : "—"}
                      </TableCell>
                      <TableCell className={cn("py-1 text-right font-mono text-xs", row.credit_amount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                        {row.credit_amount > 0 ? formatCurrency(row.credit_amount) : "—"}
                      </TableCell>
                      <TableCell className={cn("py-1 text-right font-mono text-xs font-semibold", balanceColor(row.running_balance))}>
                        {formatCurrency(row.running_balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Load more */}
              {rows.length < totalRows && (
                <div className="flex justify-center py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={loading}
                    className="gap-1"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Cargar más ({totalRows - rows.length} restantes)
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer summary */}
        <Separator />
        <div className="px-6 py-3 bg-muted/20 rounded-b-lg">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Saldo inicial</p>
              <p className={cn("text-sm font-bold tabular-nums", balanceColor(openingBalance))}>
                {formatCurrency(openingBalance)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Debe</p>
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(totalDebit)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total Haber</p>
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(totalCredit)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Saldo al {entryDate ? formattedDate(entryDate) : "—"}</p>
              <p className={cn("text-sm font-bold tabular-nums", balanceColor(closingBalance))}>
                {formatCurrency(closingBalance)}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

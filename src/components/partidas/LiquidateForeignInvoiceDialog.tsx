import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, AlertTriangle, TrendingUp, TrendingDown, MinusCircle } from "lucide-react";
import { useFxSettlement, type FxOpenBalance, type FxSettlementCalc } from "@/hooks/useFxSettlement";
import { formatCurrency } from "@/hooks/useCurrencies";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enterpriseId: number;
  baseCurrency: string;
  /** Partida de pago/cobro que dispara la liquidación */
  paymentJournalId: number;
  paymentDate: string;
  /** Tasa usada en la partida de pago (default sugerido) */
  defaultPaymentRate?: number;
  /** Moneda extranjera del pago (USD, EUR, ...) */
  currencyCode: string;
  /** NIT de la contraparte para sugerir facturas */
  counterpartNit?: string | null;
  onCompleted?: (difcJournalId: number | null) => void;
}

interface Row {
  ob: FxOpenBalance & { counterpart_nit?: string };
  selected: boolean;
  paidOriginal: number;
  calc: FxSettlementCalc | null;
  calcLoading: boolean;
}

export function LiquidateForeignInvoiceDialog({
  open, onOpenChange, enterpriseId, baseCurrency,
  paymentJournalId, paymentDate, defaultPaymentRate,
  currencyCode, counterpartNit, onCompleted,
}: Props) {
  const { loading, posting, listOpenBalances, previewSettlement, postRealizedDifferential } = useFxSettlement();
  const [rows, setRows] = useState<Row[]>([]);
  const [paymentRate, setPaymentRate] = useState<number>(defaultPaymentRate ?? 0);
  const [savingRate, setSavingRate] = useState(false);
  const [showAllCounterparts, setShowAllCounterparts] = useState(false);

  // Cargar facturas con saldo abierto
  useEffect(() => {
    if (!open) return;
    (async () => {
      const list = await listOpenBalances({
        enterpriseId,
        currencyCode,
        counterpartNit: showAllCounterparts ? null : counterpartNit,
      });
      setRows(list.map(ob => ({
        ob,
        selected: false,
        paidOriginal: ob.original_open,
        calc: null,
        calcLoading: false,
      })));
    })();
  }, [open, showAllCounterparts, enterpriseId, currencyCode, counterpartNit, listOpenBalances]);

  // Recalcular cuando cambia paymentRate o paidOriginal o selección
  const recalcRow = async (idx: number, overrides?: Partial<Row>) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...overrides, calcLoading: true };
      return next;
    });
    const r = { ...rows[idx], ...overrides };
    if (!r.selected || !paymentRate || paymentRate <= 0 || r.paidOriginal <= 0) {
      setRows(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], calc: null, calcLoading: false };
        return next;
      });
      return;
    }
    const calc = await previewSettlement({
      openBalanceId: r.ob.id,
      paidOriginal: Math.min(r.paidOriginal, r.ob.original_open),
      paymentRate,
      paymentDate,
    });
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], calc, calcLoading: false };
      return next;
    });
  };

  const toggleRow = (idx: number, checked: boolean) => {
    void recalcRow(idx, { selected: checked });
  };
  const setPaid = (idx: number, val: number) => {
    void recalcRow(idx, { paidOriginal: val });
  };

  // Recalcular todas las seleccionadas cuando cambia la tasa
  useEffect(() => {
    rows.forEach((r, idx) => {
      if (r.selected) void recalcRow(idx);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentRate]);

  const totals = useMemo(() => {
    let gain = 0, loss = 0, count = 0;
    for (const r of rows) {
      if (!r.selected || !r.calc) continue;
      count++;
      if (r.calc.is_gain) gain += r.calc.fx_difference;
      else loss += r.calc.fx_difference;
    }
    return { gain, loss, net: gain - loss, count };
  }, [rows]);

  const saveRateInline = async () => {
    if (!paymentRate || paymentRate <= 0) {
      toast.error("Captura una tasa válida primero.");
      return;
    }
    setSavingRate(true);
    try {
      const d = new Date(paymentDate);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const { error } = await supabase.from("tab_exchange_rates").upsert({
        enterprise_id: enterpriseId,
        currency_code: currencyCode,
        year, month,
        rate: paymentRate,
        source: "inline-settlement",
        notes: `Capturada al liquidar partida ${paymentJournalId}`,
      }, { onConflict: "enterprise_id,currency_code,year,month" });
      if (error) throw error;
      toast.success(`Tasa ${currencyCode} ${paymentRate} guardada para ${year}/${String(month).padStart(2, "0")}.`);
    } catch (e: any) {
      toast.error("Error guardando tasa: " + e.message);
    } finally {
      setSavingRate(false);
    }
  };

  const handleConfirm = async () => {
    const selections = rows
      .filter(r => r.selected && r.calc)
      .map(r => ({
        openBalanceId: r.ob.id,
        calc: r.calc!,
        counterpartLabel: `${r.ob.counterpart_name ?? ""} ${r.ob.invoice_number ?? ""}`.trim(),
      }));
    if (!selections.length) {
      toast.info("Selecciona al menos una factura.");
      return;
    }
    const id = await postRealizedDifferential({
      enterpriseId,
      paymentJournalId,
      paymentDate,
      baseCurrency,
      selections,
    });
    if (id !== null || totals.count > 0) {
      onCompleted?.(id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Liquidar factura en moneda extranjera</DialogTitle>
          <DialogDescription>
            Selecciona las facturas que esta partida está pagando o cobrando. El sistema calculará el diferencial cambiario realizado.
          </DialogDescription>
        </DialogHeader>

        {/* Tasa de pago */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <Label>Moneda</Label>
            <Input value={currencyCode} disabled />
          </div>
          <div>
            <Label>Tasa de cambio del pago</Label>
            <Input
              type="number"
              step="0.0001"
              value={paymentRate || ""}
              onChange={e => setPaymentRate(Number(e.target.value))}
              placeholder="0.0000"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={saveRateInline} disabled={savingRate || !paymentRate}>
              {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar tasa del mes"}
            </Button>
          </div>
        </div>

        {(!paymentRate || paymentRate <= 0) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Tasa requerida</AlertTitle>
            <AlertDescription>
              Captura la tasa de cambio para calcular el diferencial. Puedes guardarla como tasa oficial del mes con el botón.
            </AlertDescription>
          </Alert>
        )}

        {/* Filtro contraparte */}
        {counterpartNit && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="all-cp"
              checked={showAllCounterparts}
              onCheckedChange={v => setShowAllCounterparts(Boolean(v))}
            />
            <Label htmlFor="all-cp" className="text-sm font-normal">
              Mostrar facturas de todas las contrapartes (no solo NIT {counterpartNit})
            </Label>
          </div>
        )}

        {/* Tabla */}
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Contraparte</TableHead>
                <TableHead className="text-right">Saldo abierto ({currencyCode})</TableHead>
                <TableHead className="text-right">Tasa registro</TableHead>
                <TableHead className="text-right">A liquidar</TableHead>
                <TableHead className="text-right">Diferencial</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando facturas...
                  </TableCell>
                </TableRow>
              )}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    No hay facturas con saldo abierto en {currencyCode}.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, idx) => (
                <TableRow key={r.ob.id} className={r.selected ? "bg-muted/40" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={r.selected}
                      onCheckedChange={v => toggleRow(idx, Boolean(v))}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.ob.invoice_type === "purchase" ? "secondary" : "outline"}>
                      {r.ob.invoice_type === "purchase" ? "Compra" : "Venta"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{r.ob.invoice_number ?? `#${r.ob.invoice_id}`}</div>
                    <div className="text-xs text-muted-foreground">{r.ob.invoice_date}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.ob.counterpart_name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.ob.original_open, r.ob.currency_code)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">
                    {Number(r.ob.registered_rate).toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.01"
                      disabled={!r.selected}
                      value={r.paidOriginal || ""}
                      onChange={e => setPaid(idx, Number(e.target.value))}
                      max={r.ob.original_open}
                      className="h-8 w-28 text-right tabular-nums ml-auto"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.calcLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : r.calc ? (
                      <span className={r.calc.is_gain ? "text-green-600" : "text-red-600"}>
                        {r.calc.is_gain ? <TrendingUp className="h-3 w-3 inline mr-1" /> : <TrendingDown className="h-3 w-3 inline mr-1" />}
                        {(r.calc.is_gain ? "+" : "-")}{r.calc.fx_difference.toFixed(2)} {baseCurrency}
                      </span>
                    ) : (
                      <span className="text-muted-foreground"><MinusCircle className="h-3 w-3 inline" /></span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Resumen */}
        {totals.count > 0 && (
          <div className="grid grid-cols-3 gap-3 p-3 rounded-md bg-muted/40 border">
            <div>
              <div className="text-xs text-muted-foreground">Ganancia FX</div>
              <div className="text-lg font-semibold text-green-600">+{totals.gain.toFixed(2)} {baseCurrency}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pérdida FX</div>
              <div className="text-lg font-semibold text-red-600">-{totals.loss.toFixed(2)} {baseCurrency}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Efecto neto ({totals.count} facturas)</div>
              <div className={`text-lg font-bold ${totals.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totals.net >= 0 ? "+" : ""}{totals.net.toFixed(2)} {baseCurrency}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={posting}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={posting || totals.count === 0}>
            {posting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Liquidar y registrar diferencial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

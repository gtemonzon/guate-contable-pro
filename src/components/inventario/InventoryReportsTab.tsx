import { useCallback, useMemo, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { exportToPDF } from "@/utils/reportExport";
import {
  fetchBalancesAsOf,
  fetchPeriodFlows,
  ZERO_BALANCE,
  type ItemBalance,
  type PeriodFlowRow,
} from "@/utils/inventoryBalanceAsOf";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileDown, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import type { InventoryItem, InventoryMovement, InventoryWarehouse } from "./InventoryPage";

const VALUATION_METHOD = "Método de valuación: Promedio Ponderado";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(n || 0);

const formatQty = (n: number) =>
  new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);

const formatDateGt = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function errorMessage(err: unknown): string {
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "Ocurrió un error inesperado.";
}

const MOVEMENT_LABEL: Record<InventoryMovement["movement_type"], string> = {
  entrada: "Entrada",
  salida: "Salida",
  ajuste: "Ajuste",
};

interface PdfTypography {
  fontFamily: "helvetica" | "courier" | "times";
  fontSize: number;
}

interface BalanceRow {
  item: InventoryItem;
  balance: ItemBalance;
}

export function InventoryReportsTab({
  enterpriseId, enterpriseName, items, movements, warehouses, pdfTypography,
}: {
  enterpriseId: number;
  enterpriseName: string;
  items: InventoryItem[];
  movements: InventoryMovement[];
  warehouses: InventoryWarehouse[];
  pdfTypography: PdfTypography;
}) {
  const warehousesById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const warehouseName = useCallback(
    (id: number) => warehousesById.get(id)?.name ?? "—",
    [warehousesById]
  );
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // ---------- a) Catálogo de productos ----------
  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items]);

  const exportCatalogPdf = () => {
    exportToPDF({
      filename: `inventario_productos_${todayISO()}`,
      title: `Reporte de Productos — al ${formatDateGt(todayISO())}`,
      enterpriseName,
      headers: ["Código", "Producto", "Unidad", "Categoría", "Bodega", "Precio sugerido"],
      data: activeItems.map((i) => [
        i.sku, i.name, i.unit_of_measure, i.category ?? "—",
        warehouseName(i.warehouse_id), formatCurrency(Number(i.suggested_price)),
      ]),
      totals: [{ label: "Productos activos", value: String(activeItems.length) }],
      pdfTypography,
      monochrome: true,
      pageNumbers: true,
    });
  };

  // ---------- b) Saldos a fecha de corte ----------
  const [cutoffDate, setCutoffDate] = useState(todayISO());
  const [cutoffRows, setCutoffRows] = useState<BalanceRow[] | null>(null);
  const [cutoffLoading, setCutoffLoading] = useState(false);
  const [cutoffGeneratedFor, setCutoffGeneratedFor] = useState("");

  const cutoffTotal = useMemo(
    () => Math.round((cutoffRows ?? []).reduce((s, r) => s + r.balance.value, 0) * 100) / 100,
    [cutoffRows]
  );

  const generateCutoff = async () => {
    if (!cutoffDate) return;
    setCutoffLoading(true);
    try {
      const balances = await fetchBalancesAsOf(enterpriseId, cutoffDate);
      const rows: BalanceRow[] = items
        .map((item) => ({ item, balance: balances.get(item.id) ?? ZERO_BALANCE }))
        .filter((r) => r.balance.quantity !== 0 || r.item.is_active)
        .sort((a, b) => a.item.sku.localeCompare(b.item.sku));
      setCutoffRows(rows);
      setCutoffGeneratedFor(cutoffDate);
    } catch (err) {
      toast({ title: "No se pudo calcular el saldo", description: errorMessage(err), variant: "destructive" });
    } finally {
      setCutoffLoading(false);
    }
  };

  const exportCutoffPdf = () => {
    if (!cutoffRows) return;
    exportToPDF({
      filename: `inventario_saldos_al_${cutoffGeneratedFor}`,
      title: `Saldos de Inventario al ${formatDateGt(cutoffGeneratedFor)} — ${VALUATION_METHOD}`,
      enterpriseName,
      headers: ["Código", "Producto", "Bodega", "Unidad", "Cantidad", "Costo promedio", "Valorización"],
      data: cutoffRows.map((r) => [
        r.item.sku, r.item.name, warehouseName(r.item.warehouse_id), r.item.unit_of_measure,
        formatQty(r.balance.quantity), formatCurrency(r.balance.unitCost), formatCurrency(r.balance.value),
      ]),
      totals: [
        { label: "Fecha de corte", value: formatDateGt(cutoffGeneratedFor) },
        { label: "Método de valuación", value: "Promedio Ponderado" },
        { label: "Valorización total", value: formatCurrency(cutoffTotal) },
      ],
      pdfTypography,
      monochrome: true,
      pageNumbers: true,
    });
  };

  // ---------- c) Kardex por producto ----------
  const [kardexItemId, setKardexItemId] = useState<string>("");
  const [kardexFrom, setKardexFrom] = useState("");
  const [kardexTo, setKardexTo] = useState("");

  const kardexRows = useMemo(() => {
    if (!kardexItemId) return [];
    const id = Number(kardexItemId);
    let running = 0;
    return movements
      .filter((m) => m.item_id === id)
      .slice()
      .sort((a, b) => (a.movement_date === b.movement_date ? a.id - b.id : a.movement_date < b.movement_date ? -1 : 1))
      .map((m) => {
        const isDecrease =
          m.movement_type === "salida" || (m.movement_type === "ajuste" && m.adjustment_direction === "negativo");
        running = isDecrease ? running - Number(m.quantity) : running + Number(m.quantity);
        return { movement: m, isDecrease, balance: Math.round(running * 10000) / 10000 };
      })
      .filter((r) => (kardexFrom ? r.movement.movement_date >= kardexFrom : true))
      .filter((r) => (kardexTo ? r.movement.movement_date <= kardexTo : true));
  }, [movements, kardexItemId, kardexFrom, kardexTo]);

  const kardexItem = kardexItemId ? itemsById.get(Number(kardexItemId)) ?? null : null;

  const exportKardexPdf = () => {
    if (!kardexItem) return;
    const rangeLabel =
      kardexFrom || kardexTo
        ? ` — del ${kardexFrom ? formatDateGt(kardexFrom) : "inicio"} al ${kardexTo ? formatDateGt(kardexTo) : formatDateGt(todayISO())}`
        : " — histórico completo";
    exportToPDF({
      filename: `kardex_${kardexItem.sku}_${todayISO()}`,
      title: `Kardex de ${kardexItem.sku} · ${kardexItem.name}${rangeLabel} — ${VALUATION_METHOD}`,
      enterpriseName,
      headers: ["Fecha", "Tipo", "Referencia", "Cantidad", "Costo unitario", "Saldo"],
      data: kardexRows.map((r) => [
        formatDateGt(r.movement.movement_date),
        `${MOVEMENT_LABEL[r.movement.movement_type]}${r.movement.adjustment_direction ? ` (${r.movement.adjustment_direction})` : ""}`,
        r.movement.reference ?? "—",
        `${r.isDecrease ? "-" : "+"}${formatQty(Number(r.movement.quantity))}`,
        formatCurrency(Number(r.movement.unit_cost)),
        formatQty(r.balance),
      ]),
      totals: [
        { label: "Producto", value: `${kardexItem.sku} · ${kardexItem.name}` },
        { label: "Movimientos", value: String(kardexRows.length) },
        { label: "Saldo final del rango", value: formatQty(kardexRows[kardexRows.length - 1]?.balance ?? 0) },
      ],
      pdfTypography,
      monochrome: true,
      pageNumbers: true,
    });
  };

  // ---------- d) Entradas, salidas y saldo por período ----------
  const [flowFrom, setFlowFrom] = useState("");
  const [flowTo, setFlowTo] = useState(todayISO());
  const [flowRows, setFlowRows] = useState<PeriodFlowRow[] | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowRange, setFlowRange] = useState<{ from: string; to: string } | null>(null);

  const flowTotals = useMemo(() => {
    const rows = flowRows ?? [];
    const sum = (fn: (r: PeriodFlowRow) => number) =>
      Math.round(rows.reduce((s, r) => s + fn(r), 0) * 100) / 100;
    return {
      openingQty: sum((r) => r.opening.quantity),
      openingValue: sum((r) => r.opening.value),
      inQty: sum((r) => r.inQuantity),
      inValue: sum((r) => r.inValue),
      outQty: sum((r) => r.outQuantity),
      outValue: sum((r) => r.outValue),
      closingQty: sum((r) => r.closing.quantity),
      closingValue: sum((r) => r.closing.value),
    };
  }, [flowRows]);

  const flowMismatches = useMemo(
    () => (flowRows ?? []).filter((r) => !r.reconciles),
    [flowRows]
  );

  const generateFlow = async () => {
    if (!flowFrom || !flowTo) {
      toast({ title: "Rango incompleto", description: "Selecciona la fecha de inicio y de fin.", variant: "destructive" });
      return;
    }
    if (flowFrom > flowTo) {
      toast({ title: "Rango inválido", description: "La fecha de inicio no puede ser mayor a la de fin.", variant: "destructive" });
      return;
    }
    setFlowLoading(true);
    try {
      const rows = await fetchPeriodFlows(enterpriseId, flowFrom, flowTo);
      const visible = rows
        .filter((r) => itemsById.has(r.itemId))
        .filter((r) => r.opening.quantity !== 0 || r.closing.quantity !== 0 || r.inQuantity !== 0 || r.outQuantity !== 0)
        .sort((a, b) => (itemsById.get(a.itemId)?.sku ?? "").localeCompare(itemsById.get(b.itemId)?.sku ?? ""));
      setFlowRows(visible);
      setFlowRange({ from: flowFrom, to: flowTo });
    } catch (err) {
      toast({ title: "No se pudo generar el reporte", description: errorMessage(err), variant: "destructive" });
    } finally {
      setFlowLoading(false);
    }
  };

  const exportFlowPdf = () => {
    if (!flowRows || !flowRange) return;
    exportToPDF({
      filename: `inventario_movimiento_periodo_${flowRange.from}_${flowRange.to}`,
      title: `Entradas, Salidas y Saldos del ${formatDateGt(flowRange.from)} al ${formatDateGt(flowRange.to)} — ${VALUATION_METHOD}`,
      enterpriseName,
      headers: [
        "Código", "Producto",
        "S. Inicial Cant.", "S. Inicial Valor",
        "Entradas Cant.", "Entradas Valor",
        "Salidas Cant.", "Salidas Valor",
        "S. Final Cant.", "S. Final Valor",
      ],
      data: flowRows.map((r) => {
        const item = itemsById.get(r.itemId);
        return [
          item?.sku ?? String(r.itemId),
          item?.name ?? "—",
          formatQty(r.opening.quantity), formatCurrency(r.opening.value),
          formatQty(r.inQuantity), formatCurrency(r.inValue),
          formatQty(r.outQuantity), formatCurrency(r.outValue),
          formatQty(r.closing.quantity), formatCurrency(r.closing.value),
        ];
      }),
      totals: [
        { label: "Saldo inicial (valor)", value: formatCurrency(flowTotals.openingValue) },
        { label: "Entradas (valor)", value: formatCurrency(flowTotals.inValue) },
        { label: "Salidas (valor)", value: formatCurrency(flowTotals.outValue) },
        { label: "Saldo final (valor)", value: formatCurrency(flowTotals.closingValue) },
      ],
      pdfTypography,
      monochrome: true,
      pageNumbers: true,
    });
  };

  return (
    <div className="space-y-4">
      {/* a) Catálogo */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 flex-wrap">
          <div>
            <CardTitle className="text-base">Reporte de Productos ({activeItems.length})</CardTitle>
            <CardDescription>Catálogo de productos activos, sin cálculo de existencias.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCatalogPdf} disabled={activeItems.length === 0}>
            <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto max-h-[320px] overflow-y-auto min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Bodega</TableHead>
                  <TableHead className="text-right">Precio sugerido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeItems.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin productos activos.</TableCell></TableRow>
                )}
                {activeItems.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell>{i.unit_of_measure}</TableCell>
                    <TableCell>{i.category ?? "—"}</TableCell>
                    <TableCell>{warehouseName(i.warehouse_id)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(i.suggested_price))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* b) Saldos a fecha de corte */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Saldos a fecha de corte</CardTitle>
          <CardDescription>
            Reconstruye el inventario a cualquier fecha pasada recorriendo el kardex. {VALUATION_METHOD}. Útil para el
            Reporte Semestral de Inventarios (30 de junio / 31 de diciembre).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label>Fecha de corte</Label>
              <Input type="date" value={cutoffDate} onChange={(e) => setCutoffDate(e.target.value)} className="w-[180px]" />
            </div>
            <Button onClick={generateCutoff} disabled={cutoffLoading || !cutoffDate}>
              {cutoffLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Calcular saldos
            </Button>
            <Button
              variant="outline"
              onClick={exportCutoffPdf}
              disabled={!cutoffRows || cutoffRows.length === 0}
            >
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
          </div>

          {cutoffRows && (
            <>
              <p className="text-sm text-muted-foreground">
                Saldos al {formatDateGt(cutoffGeneratedFor)} · Valorización total {formatCurrency(cutoffTotal)}
              </p>
              <div className="rounded-md border overflow-x-auto max-h-[420px] overflow-y-auto min-h-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Bodega</TableHead>
                      <TableHead>Unidad</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo promedio</TableHead>
                      <TableHead className="text-right">Valorización</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cutoffRows.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Sin existencias a esa fecha.</TableCell></TableRow>
                    )}
                    {cutoffRows.map((r) => (
                      <TableRow key={r.item.id}>
                        <TableCell className="font-mono text-xs">{r.item.sku}</TableCell>
                        <TableCell className="font-medium">{r.item.name}</TableCell>
                        <TableCell>{warehouseName(r.item.warehouse_id)}</TableCell>
                        <TableCell>{r.item.unit_of_measure}</TableCell>
                        <TableCell className="text-right">{formatQty(r.balance.quantity)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.balance.unitCost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.balance.value)}</TableCell>
                      </TableRow>
                    ))}
                    {cutoffRows.length > 0 && (
                      <TableRow className="bg-muted/50 font-semibold">
                        <TableCell colSpan={6}>TOTAL</TableCell>
                        <TableCell className="text-right">{formatCurrency(cutoffTotal)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* c) Kardex por producto */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Kardex por producto</CardTitle>
          <CardDescription>Detalle cronológico de movimientos de un producto en un rango de fechas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label>Producto</Label>
              <Select value={kardexItemId} onValueChange={setKardexItemId}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
                <SelectContent>
                  {items.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.sku} · {i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Desde</Label>
              <Input type="date" value={kardexFrom} onChange={(e) => setKardexFrom(e.target.value)} className="w-[170px]" />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={kardexTo} onChange={(e) => setKardexTo(e.target.value)} className="w-[170px]" />
            </div>
            <Button variant="outline" onClick={exportKardexPdf} disabled={!kardexItem || kardexRows.length === 0}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto max-h-[420px] overflow-y-auto min-h-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Costo unitario</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!kardexItem && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Selecciona un producto.</TableCell></TableRow>
                )}
                {kardexItem && kardexRows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin movimientos en el rango.</TableCell></TableRow>
                )}
                {kardexRows.map((r) => (
                  <TableRow key={r.movement.id}>
                    <TableCell>{formatDateGt(r.movement.movement_date)}</TableCell>
                    <TableCell>
                      {MOVEMENT_LABEL[r.movement.movement_type]}
                      {r.movement.adjustment_direction ? ` (${r.movement.adjustment_direction})` : ""}
                    </TableCell>
                    <TableCell>{r.movement.reference ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.isDecrease ? "-" : "+"}{formatQty(Number(r.movement.quantity))}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(Number(r.movement.unit_cost))}</TableCell>
                    <TableCell className="text-right">{formatQty(r.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* d) Entradas, salidas y saldo por período */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Entradas, Salidas y Saldo por período</CardTitle>
          <CardDescription>
            Saldo inicial (al {flowFrom ? formatDateGt(dayBefore(flowFrom)) : "día previo al inicio"}), movimientos del
            rango y saldo final por producto. {VALUATION_METHOD}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <Label>Desde</Label>
              <Input type="date" value={flowFrom} onChange={(e) => setFlowFrom(e.target.value)} className="w-[170px]" />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={flowTo} onChange={(e) => setFlowTo(e.target.value)} className="w-[170px]" />
            </div>
            <Button onClick={generateFlow} disabled={flowLoading}>
              {flowLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Generar reporte
            </Button>
            <Button variant="outline" onClick={exportFlowPdf} disabled={!flowRows || flowRows.length === 0}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
          </div>

          {flowMismatches.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{flowMismatches.length} producto(s) no cuadran</AlertTitle>
              <AlertDescription>
                No se cumple Saldo Inicial + Entradas − Salidas = Saldo Final en:{" "}
                {flowMismatches.map((r) => itemsById.get(r.itemId)?.sku ?? r.itemId).join(", ")}. Revisa el kardex de
                esos productos antes de usar el reporte.
              </AlertDescription>
            </Alert>
          )}

          {flowRows && (
            <div className="rounded-md border overflow-x-auto max-h-[480px] overflow-y-auto min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">S. Inicial Cant.</TableHead>
                    <TableHead className="text-right">S. Inicial Valor</TableHead>
                    <TableHead className="text-right">Entradas Cant.</TableHead>
                    <TableHead className="text-right">Entradas Valor</TableHead>
                    <TableHead className="text-right">Salidas Cant.</TableHead>
                    <TableHead className="text-right">Salidas Valor</TableHead>
                    <TableHead className="text-right">S. Final Cant.</TableHead>
                    <TableHead className="text-right">S. Final Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flowRows.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">Sin datos en el período.</TableCell></TableRow>
                  )}
                  {flowRows.map((r) => {
                    const item = itemsById.get(r.itemId);
                    return (
                      <TableRow key={r.itemId} className={r.reconciles ? undefined : "bg-destructive/5"}>
                        <TableCell className="font-mono text-xs">{item?.sku ?? r.itemId}</TableCell>
                        <TableCell className="font-medium">{item?.name ?? "—"}</TableCell>
                        <TableCell className="text-right">{formatQty(r.opening.quantity)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.opening.value)}</TableCell>
                        <TableCell className="text-right">{formatQty(r.inQuantity)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.inValue)}</TableCell>
                        <TableCell className="text-right">{formatQty(r.outQuantity)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.outValue)}</TableCell>
                        <TableCell className="text-right">{formatQty(r.closing.quantity)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.closing.value)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {flowRows.length > 0 && (
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={2}>TOTALES</TableCell>
                      <TableCell className="text-right">{formatQty(flowTotals.openingQty)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(flowTotals.openingValue)}</TableCell>
                      <TableCell className="text-right">{formatQty(flowTotals.inQty)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(flowTotals.inValue)}</TableCell>
                      <TableCell className="text-right">{formatQty(flowTotals.outQty)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(flowTotals.outValue)}</TableCell>
                      <TableCell className="text-right">{formatQty(flowTotals.closingQty)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(flowTotals.closingValue)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

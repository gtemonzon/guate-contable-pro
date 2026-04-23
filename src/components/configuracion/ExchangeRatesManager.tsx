import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Copy, AlertTriangle } from "lucide-react";
import { useEnterpriseCurrencies } from "@/hooks/useEnterpriseCurrencies";
import { useExchangeRates, type ExchangeRate } from "@/hooks/useExchangeRates";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { toast } from "sonner";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function ExchangeRatesManager() {
  const { selectedEnterpriseId } = useEnterprise();
  const enterpriseId = selectedEnterpriseId;
  const { items: enabled } = useEnterpriseCurrencies(enterpriseId);
  const { rates, loading, upsert, remove, countTransactionsForRate } = useExchangeRates(enterpriseId);

  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const [openDialog, setOpenDialog] = useState(false);
  const [editing, setEditing] = useState<ExchangeRate | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; count: number; payload: any } | null>(null);
  const [toDelete, setToDelete] = useState<ExchangeRate | null>(null);

  const [form, setForm] = useState({
    currency_code: "",
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    rate: "",
    source: "",
    notes: "",
  });

  const years = useMemo(() => {
    const set = new Set(rates.map((r) => r.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [rates]);

  const filtered = useMemo(() => {
    return rates.filter((r) => {
      if (filterYear !== "all" && r.year !== Number(filterYear)) return false;
      if (filterCurrency !== "all" && r.currency_code !== filterCurrency) return false;
      return true;
    });
  }, [rates, filterYear, filterCurrency]);

  const openNew = () => {
    setEditing(null);
    setForm({
      currency_code: enabled[0]?.currency_code ?? "",
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      rate: "",
      source: "",
      notes: "",
    });
    setOpenDialog(true);
  };

  const openEdit = (r: ExchangeRate) => {
    setEditing(r);
    setForm({
      currency_code: r.currency_code,
      year: r.year,
      month: r.month,
      rate: String(r.rate),
      source: r.source ?? "",
      notes: r.notes ?? "",
    });
    setOpenDialog(true);
  };

  const handleSave = async () => {
    const rate = Number(form.rate);
    if (!form.currency_code || !rate || rate <= 0) {
      toast.error("Completa moneda y tasa válida");
      return;
    }
    const payload = {
      currency_code: form.currency_code,
      year: form.year,
      month: form.month,
      rate,
      source: form.source || undefined,
      notes: form.notes || undefined,
    };
    if (editing) {
      // Advertir si hay transacciones en ese mes
      const count = await countTransactionsForRate(form.currency_code, form.year, form.month);
      if (count > 0) {
        setConfirm({ open: true, count, payload });
        return;
      }
    }
    const ok = await upsert(payload);
    if (ok) setOpenDialog(false);
  };

  const handleConfirmEdit = async () => {
    if (!confirm) return;
    const ok = await upsert(confirm.payload);
    if (ok) {
      setOpenDialog(false);
      setConfirm(null);
    }
  };

  const copyPreviousMonth = () => {
    if (!form.currency_code) return;
    const prevMonth = form.month === 1 ? 12 : form.month - 1;
    const prevYear = form.month === 1 ? form.year - 1 : form.year;
    const prev = rates.find(
      (r) => r.currency_code === form.currency_code && r.year === prevYear && r.month === prevMonth
    );
    if (prev) {
      setForm((f) => ({ ...f, rate: String(prev.rate) }));
      toast.success(`Tasa copiada de ${MONTHS[prevMonth - 1]} ${prevYear}: ${prev.rate}`);
    } else {
      toast.error("No hay tasa registrada para el mes anterior");
    }
  };

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Selecciona una empresa para gestionar tipos de cambio.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Tipos de Cambio</CardTitle>
          <CardDescription>
            Registra el tipo de cambio mensual para cada moneda extranjera. La tasa se aplica a las transacciones del mes correspondiente.
          </CardDescription>
        </div>
        <Button onClick={openNew} disabled={enabled.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> Nueva tasa
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {enabled.length === 0 && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="inline h-4 w-4 mr-1 text-amber-600" />
            Esta empresa no tiene monedas adicionales habilitadas. Agrégalas en Empresas → Editar → Monedas.
          </div>
        )}

        <div className="flex gap-3">
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Año" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCurrency} onValueChange={setFilterCurrency}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Moneda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {enabled.map((c) => (
                <SelectItem key={c.currency_code} value={c.currency_code}>{c.currency_code}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Año</TableHead>
              <TableHead>Mes</TableHead>
              <TableHead>Moneda</TableHead>
              <TableHead className="text-right">Tipo de cambio</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6">Cargando…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  No hay tipos de cambio registrados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.year}</TableCell>
                  <TableCell>{MONTHS[r.month - 1]}</TableCell>
                  <TableCell><Badge variant="outline">{r.currency_code}</Badge></TableCell>
                  <TableCell className="text-right font-mono">{Number(r.rate).toFixed(6)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.source || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setToDelete(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      {/* Dialog para crear/editar */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nuevo"} tipo de cambio</DialogTitle>
            <DialogDescription>
              1 unidad de moneda extranjera = X unidades de moneda funcional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Moneda</Label>
                <Select
                  value={form.currency_code}
                  onValueChange={(v) => setForm((f) => ({ ...f, currency_code: v }))}
                  disabled={!!editing}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {enabled.map((c) => (
                      <SelectItem key={c.currency_code} value={c.currency_code}>{c.currency_code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Año</Label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                  disabled={!!editing}
                />
              </div>
              <div>
                <Label>Mes</Label>
                <Select
                  value={String(form.month)}
                  onValueChange={(v) => setForm((f) => ({ ...f, month: Number(v) }))}
                  disabled={!!editing}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label>Tipo de cambio</Label>
                <Button type="button" size="sm" variant="ghost" onClick={copyPreviousMonth}>
                  <Copy className="h-3 w-3 mr-1" /> Copiar mes anterior
                </Button>
              </div>
              <Input
                type="number"
                step="0.000001"
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                placeholder="7.85"
              />
            </div>
            <div>
              <Label>Fuente (opcional)</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="Banguat, contrato, etc."
              />
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación al editar tasa con transacciones */}
      <AlertDialog open={!!confirm?.open} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay transacciones registradas con esta tasa</AlertDialogTitle>
            <AlertDialogDescription>
              Hay <strong>{confirm?.count}</strong> transacciones del mes en {form.currency_code} usando la tasa actual.
              Cambiar la tasa <strong>solo afectará nuevas transacciones</strong>; las anteriores conservarán su tasa original.
              Para revaluar saldos vivos use el wizard de Diferencial Cambiario (próxima fase).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEdit}>Cambiar tasa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tipo de cambio</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la tasa de {toDelete && MONTHS[toDelete.month - 1]} {toDelete?.year} para {toDelete?.currency_code}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              if (toDelete) await remove(toDelete.id);
              setToDelete(null);
            }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

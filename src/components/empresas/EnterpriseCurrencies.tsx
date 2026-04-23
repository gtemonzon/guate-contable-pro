import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Lock } from "lucide-react";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useEnterpriseCurrencies } from "@/hooks/useEnterpriseCurrencies";

interface Props {
  enterpriseId: number;
  baseCurrencyCode: string;
}

export function EnterpriseCurrencies({ enterpriseId, baseCurrencyCode }: Props) {
  const { currencies } = useCurrencies();
  const { items, loading, add, remove } = useEnterpriseCurrencies(enterpriseId);
  const [openAdd, setOpenAdd] = useState(false);
  const [selectedCode, setSelectedCode] = useState("");
  const [notes, setNotes] = useState("");

  const enabledCodes = new Set([baseCurrencyCode, ...items.map((i) => i.currency_code)]);
  const available = currencies.filter((c) => !enabledCodes.has(c.currency_code));

  const handleAdd = async () => {
    if (!selectedCode) return;
    const ok = await add(selectedCode, notes || undefined);
    if (ok) {
      setOpenAdd(false);
      setSelectedCode("");
      setNotes("");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Moneda Funcional</CardTitle>
          <CardDescription>
            Es la moneda en la que se llevan los libros oficiales de la empresa. No se puede cambiar después de registrar transacciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="default" className="text-base px-3 py-1">
            <Lock className="h-3 w-3 mr-1" />
            {baseCurrencyCode} — {currencies.find((c) => c.currency_code === baseCurrencyCode)?.currency_name ?? "—"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Monedas Adicionales</CardTitle>
            <CardDescription>
              Habilita otras monedas para registrar transacciones (compras, ventas, partidas) en moneda extranjera.
              Los reportes oficiales SAT siempre se generan en la moneda funcional.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpenAdd(true)} disabled={available.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Agregar moneda
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No hay monedas adicionales. Esta empresa solo opera en {baseCurrencyCode}.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => {
                const c = currencies.find((x) => x.currency_code === it.currency_code);
                return (
                  <div key={it.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">
                        {c?.symbol} {it.currency_code} — {c?.currency_name ?? it.currency_code}
                      </div>
                      {it.notes && <div className="text-xs text-muted-foreground">{it.notes}</div>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(it.id, it.currency_code)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Habilitar moneda</DialogTitle>
            <DialogDescription>
              Selecciona una moneda para habilitarla en esta empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Moneda</Label>
              <Select value={selectedCode} onValueChange={setSelectedCode}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.currency_code} value={c.currency_code}>
                      {c.symbol} {c.currency_code} — {c.currency_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Para clientes en EE.UU." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAdd(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!selectedCode}>Habilitar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

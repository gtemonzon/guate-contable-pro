import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  fetchQuoteItems, generateQuoteNumber, usePriceCatalog,
  STATUS_LABELS, type Quote, type QuoteItem, type QuoteStatus,
} from "@/hooks/useQuotes";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  quote: Quote | null;
  onSaved: () => void;
  currentUserId: string;
  currentUserName: string;
}

const STATUS_OPTS: QuoteStatus[] = ["elaborada", "enviada", "confirmada", "no_aceptada"];

export function QuoteEditorDialog({ open, onOpenChange, quote, onSaved, currentUserId, currentUserName }: Props) {
  const catalog = usePriceCatalog();
  const [saving, setSaving] = useState(false);

  const [clientName, setClientName] = useState("");
  const [clientNit, setClientNit] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<QuoteStatus>("elaborada");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [initialStatus, setInitialStatus] = useState<QuoteStatus>("elaborada");

  useEffect(() => {
    if (!open) return;
    if (quote) {
      setClientName(quote.client_name);
      setClientNit(quote.client_nit ?? "");
      setClientContact(quote.client_contact ?? "");
      setIssueDate(quote.issue_date);
      setValidUntil(quote.valid_until ?? "");
      setStatus(quote.status);
      setInitialStatus(quote.status);
      setNotes(quote.notes ?? "");
      fetchQuoteItems(quote.id).then(setItems);
    } else {
      setClientName(""); setClientNit(""); setClientContact("");
      setIssueDate(new Date().toISOString().slice(0, 10));
      setValidUntil(""); setStatus("elaborada"); setInitialStatus("elaborada");
      setNotes("");
      setItems([{ description: "", quantity: 1, unit_price: 0, line_total: 0, sort_order: 0 }]);
    }
  }, [open, quote]);

  const total = useMemo(
    () => items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0),
    [items]
  );

  const updateItem = (idx: number, patch: Partial<QuoteItem>) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const merged = { ...it, ...patch };
      merged.line_total = Number(merged.quantity || 0) * Number(merged.unit_price || 0);
      return merged;
    }));
  };

  const addBlank = () => setItems((p) => [...p, { description: "", quantity: 1, unit_price: 0, line_total: 0, sort_order: p.length }]);
  const addFromCatalog = (id: string) => {
    const c = catalog.find((x) => x.id === id);
    if (!c) return;
    setItems((p) => [...p, {
      description: c.description, quantity: 1, unit_price: Number(c.default_unit_price),
      line_total: Number(c.default_unit_price), sort_order: p.length,
    }]);
  };
  const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!clientName.trim()) { toast({ title: "Falta el cliente", variant: "destructive" }); return; }
    if (items.length === 0) { toast({ title: "Agregá al menos un servicio", variant: "destructive" }); return; }
    setSaving(true);
    try {
      let quoteId = quote?.id;
      const payload = {
        client_name: clientName.trim(),
        client_nit: clientNit.trim() || null,
        client_contact: clientContact.trim() || null,
        issue_date: issueDate,
        valid_until: validUntil || null,
        status,
        notes: notes.trim() || null,
        subtotal: total,
        total,
      };

      if (quoteId) {
        const { error } = await supabase.from("tab_quotes" as never).update(payload as never).eq("id", quoteId);
        if (error) throw error;
      } else {
        const quote_number = await generateQuoteNumber();
        const { data, error } = await supabase.from("tab_quotes" as never).insert({
          ...payload, quote_number, created_by: currentUserId,
        } as never).select("id").single();
        if (error) throw error;
        quoteId = (data as unknown as { id: string }).id;
        // initial history
        await supabase.from("tab_quote_status_history" as never).insert({
          quote_id: quoteId, status: "elaborada",
          changed_by: currentUserId, changed_by_name: currentUserName,
        } as never);
      }

      // Replace items
      await supabase.from("tab_quote_items" as never).delete().eq("quote_id", quoteId!);
      const rows = items.map((it, i) => ({
        quote_id: quoteId,
        description: it.description || "(sin descripción)",
        quantity: Number(it.quantity) || 0,
        unit_price: Number(it.unit_price) || 0,
        line_total: Number(it.quantity || 0) * Number(it.unit_price || 0),
        sort_order: i,
      }));
      if (rows.length) {
        const { error } = await supabase.from("tab_quote_items" as never).insert(rows as never);
        if (error) throw error;
      }

      // Status change history
      if (quote && status !== initialStatus) {
        await supabase.from("tab_quote_status_history" as never).insert({
          quote_id: quoteId, status,
          changed_by: currentUserId, changed_by_name: currentUserName,
        } as never);
      }

      toast({ title: "Cotización guardada" });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      toast({ title: "Error al guardar", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{quote ? `Editar ${quote.quote_number}` : "Nueva Cotización"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>Cliente *</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div>
            <Label>NIT</Label>
            <Input value={clientNit} onChange={(e) => setClientNit(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Contacto (teléfono/email)</Label>
            <Input value={clientContact} onChange={(e) => setClientContact(e.target.value)} />
          </div>
          <div>
            <Label>Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as QuoteStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fecha emisión</Label>
            <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label>Vigencia hasta</Label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <Label>Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Servicios</h3>
            <div className="flex gap-2">
              <Select onValueChange={addFromCatalog}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Agregar desde catálogo…" /></SelectTrigger>
                <SelectContent>
                  {catalog.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.description} {Number(c.default_unit_price) > 0 && `— Q ${formatCurrency(Number(c.default_unit_price))}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={addBlank}><Plus className="h-4 w-4 mr-1" /> Línea</Button>
            </div>
          </div>

          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-6" placeholder="Descripción"
                  value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} />
                <Input className="col-span-1" type="number" step="0.01" min="0"
                  value={it.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                <Input className="col-span-2" type="number" step="0.01" min="0" placeholder="P. unitario"
                  value={it.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })} />
                <div className="col-span-2 text-right font-medium text-sm">
                  Q {formatCurrency(Number(it.quantity || 0) * Number(it.unit_price || 0))}
                </div>
                <Button variant="ghost" size="icon" className="col-span-1" onClick={() => removeItem(idx)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end text-lg font-bold">
            Total: Q {formatCurrency(total)}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

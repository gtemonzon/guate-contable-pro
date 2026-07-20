import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Check, Clock, FileText, HandCoins, Info, ListOrdered, Pencil, Plus, Receipt, ShieldAlert,
} from "lucide-react";
import { allocateEntryNumber } from "@/utils/journalEntryNumbering";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Status = "pendiente" | "parcial" | "pagada";

interface TrackingRow {
  id: number;
  enterprise_id: number;
  source_ledger_id: number;
  issue_date: string;
  due_date: string;
  amount_total: number;
  amount_paid: number;
  status: Status;
  // Enriched from ledger
  third_party_name?: string;
  document_number?: string;
}

interface PaymentRow {
  id: number;
  amount: number;
  payment_date: string;
  note: string | null;
  created_at: string;
  payment_method?: string | null;
  receipt_number?: string | null;
  bank_account_id?: number | null;
  journal_entry_id?: number | null;
  bank_name?: string;
  bank_account_number?: string;
}

interface StatusHistoryRow {
  id: number;
  old_status: string | null;
  new_status: string;
  reason: string | null;
  changed_by_name: string | null;
  changed_at: string;
  is_manual: boolean;
}

interface LedgerCandidate {
  id: number;
  invoice_date: string;
  third_party_name: string;
  document_number: string;
  total_amount: number;
  suggested_due_date: string;
}

const STATUS_STYLES: Record<Status, string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  parcial: "bg-blue-100 text-blue-800 border-blue-200",
  pagada: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
const STATUS_LABEL: Record<Status, string> = {
  pendiente: "Pendiente", parcial: "Parcial", pagada: "Pagada",
};

interface Props {
  direction: "cxc" | "cxp";
  title: string;
}

function daysBetween(a: string, b: Date) {
  const d = new Date(a + "T00:00:00");
  const diffMs = d.getTime() - new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round(diffMs / 86400000);
}

function AgingCell({ row }: { row: TrackingRow }) {
  if (row.status === "pagada") {
    return <span className="inline-flex items-center text-emerald-600"><Check className="h-4 w-4" /></span>;
  }
  const today = new Date();
  const diff = daysBetween(row.due_date, today);
  if (diff < 0) {
    return <span className="text-red-600 font-medium">Vencida hace {Math.abs(diff)} d</span>;
  }
  if (diff === 0) return <span className="text-amber-600 font-medium">Vence hoy</span>;
  if (diff <= 7) return <span className="text-amber-600">Vence en {diff} d</span>;
  return <span className="text-muted-foreground">Vence en {diff} d</span>;
}

export default function CollectionTrackingPage({ direction, title }: Props) {
  const { selectedEnterprise } = useEnterprise();
  const { hasModule, isLoading: tenantLoading } = useTenant();
  const [rows, setRows] = useState<TrackingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [paymentTarget, setPaymentTarget] = useState<TrackingRow | null>(null);
  const [paymentsHistoryTarget, setPaymentsHistoryTarget] = useState<TrackingRow | null>(null);
  const [statusTarget, setStatusTarget] = useState<TrackingRow | null>(null);
  const [historyTarget, setHistoryTarget] = useState<TrackingRow | null>(null);
  const [showInitial, setShowInitial] = useState(false);
  const [showGeneratePoliza, setShowGeneratePoliza] = useState(false);

  const moduleEnabled = hasModule(direction);

  const load = useCallback(async () => {
    if (!selectedEnterprise || !moduleEnabled) {
      setRows([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("tab_collection_tracking")
      .select("id,enterprise_id,source_ledger_id,issue_date,due_date,amount_total,amount_paid,status")
      .eq("enterprise_id", selectedEnterprise.id)
      .eq("direction", direction)
      .order("due_date", { ascending: true });
    if (error) {
      setLoading(false);
      return;
    }
    const base = (data || []) as TrackingRow[];
    const ids = base.map((r) => r.source_ledger_id);
    if (ids.length > 0) {
      const table = direction === "cxc" ? "tab_sales_ledger" : "tab_purchase_ledger";
      const nameCol = direction === "cxc" ? "customer_name" : "supplier_name";
      const { data: ledger } = await supabase
        .from(table as any)
        .select(`id,${nameCol},invoice_series,invoice_number`)
        .in("id", ids);
      const map = new Map<number, { name: string; doc: string }>();
      (ledger || []).forEach((l: any) => {
        map.set(l.id, {
          name: l[nameCol] || "",
          doc: [l.invoice_series, l.invoice_number].filter(Boolean).join("-"),
        });
      });
      base.forEach((r) => {
        const m = map.get(r.source_ledger_id);
        r.third_party_name = m?.name || "—";
        r.document_number = m?.doc || "—";
      });
    }
    setRows(base);
    setLoading(false);
  }, [selectedEnterprise, direction, moduleEnabled]);

  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => {
    const pending = rows.reduce((s, r) => s + (Number(r.amount_total) - Number(r.amount_paid)), 0);
    return { count: rows.length, pending };
  }, [rows]);

  if (tenantLoading) return null;

  if (!moduleEnabled) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Módulo no habilitado</AlertTitle>
          <AlertDescription>
            El módulo de {title} no está activo para esta oficina. Contacta a tu administrador.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const thirdPartyHeader = direction === "cxc" ? "Cliente" : "Proveedor";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground text-sm">{selectedEnterprise?.business_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowGeneratePoliza(true)}>
            <FileText className="h-4 w-4 mr-1" /> Generar Póliza
          </Button>
          <Button variant="outline" onClick={() => setShowInitial(true)}>
            <Plus className="h-4 w-4 mr-1" /> Cargar saldos iniciales
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Facturas en seguimiento ({totals.count}) · Saldo pendiente {formatCurrency(totals.pending)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>{thirdPartyHeader}</TableHead>
                  <TableHead>No. Documento</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Antigüedad</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Cargando…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">
                    Aún no hay facturas en seguimiento para esta empresa.
                  </TableCell></TableRow>
                ) : (
                  rows.map((r) => {
                    const balance = Number(r.amount_total) - Number(r.amount_paid);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.issue_date}</TableCell>
                        <TableCell className="max-w-[220px] truncate" title={r.third_party_name}>{r.third_party_name}</TableCell>
                        <TableCell>{r.document_number}</TableCell>
                        <TableCell>{r.due_date}</TableCell>
                        <TableCell><AgingCell row={r} /></TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(r.amount_total))}</TableCell>
                        <TableCell className="text-right">{formatCurrency(balance)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLES[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="icon" variant="ghost" title="Registrar abono" onClick={() => setPaymentTarget(r)}>
                            <HandCoins className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Ver abonos" onClick={() => setPaymentsHistoryTarget(r)}>
                            <ListOrdered className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Cambiar estatus" onClick={() => setStatusTarget(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" title="Ver historial de estatus" onClick={() => setHistoryTarget(r)}>
                            <Clock className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {paymentTarget && (
        <PaymentDialog
          row={paymentTarget}
          onClose={(refreshed) => { setPaymentTarget(null); if (refreshed) load(); }}
        />
      )}
      {paymentsHistoryTarget && (
        <PaymentsHistoryDialog row={paymentsHistoryTarget} onClose={() => setPaymentsHistoryTarget(null)} />
      )}
      {statusTarget && (
        <StatusChangeDialog
          row={statusTarget}
          onClose={(refreshed) => { setStatusTarget(null); if (refreshed) load(); }}
        />
      )}
      {historyTarget && (
        <StatusHistoryDialog row={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}
      {showInitial && selectedEnterprise && (
        <InitialBalancesDialog
          enterpriseId={selectedEnterprise.id}
          direction={direction}
          onClose={(refreshed) => { setShowInitial(false); if (refreshed) load(); }}
        />
      )}
      {showGeneratePoliza && selectedEnterprise && (
        <GeneratePolizaDialog
          enterpriseId={selectedEnterprise.id}
          direction={direction}
          onClose={(refreshed) => { setShowGeneratePoliza(false); if (refreshed) load(); }}
        />
      )}
    </div>
  );
}

// ---------- Helpers ----------

async function getCurrentUserInfo(): Promise<{ id: string | null; name: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const id = userData?.user?.id ?? null;
  let name = userData?.user?.email ?? "Usuario";
  if (id) {
    const { data } = await supabase.from("tab_users").select("full_name").eq("id", id).maybeSingle();
    if (data?.full_name) name = data.full_name;
  }
  return { id, name };
}

function computeStatus(paid: number, total: number): Status {
  if (paid >= total - 0.005) return "pagada";
  if (paid > 0) return "parcial";
  return "pendiente";
}

// ---------- Payment dialog ----------

function PaymentDialog({ row, onClose }: { row: TrackingRow; onClose: (r: boolean) => void }) {
  const balance = Number(row.amount_total) - Number(row.amount_paid);
  const [amount, setAmount] = useState<string>(balance.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Monto inválido", variant: "destructive" });
      return;
    }
    if (amt > balance + 0.005) {
      toast({ title: "El monto excede el saldo pendiente", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { id: userId, name: userName } = await getCurrentUserInfo();
    const { error: payErr } = await supabase.from("tab_collection_payments").insert({
      tracking_id: row.id, amount: amt, payment_date: paymentDate, note: note || null, recorded_by: userId,
    });
    if (payErr) { setSaving(false); toast({ title: "Error", description: payErr.message, variant: "destructive" }); return; }

    const newPaid = Number(row.amount_paid) + amt;
    const newStatus = computeStatus(newPaid, Number(row.amount_total));
    const { error: updErr } = await supabase.from("tab_collection_tracking")
      .update({ amount_paid: newPaid, status: newStatus })
      .eq("id", row.id);
    if (updErr) { setSaving(false); toast({ title: "Error", description: updErr.message, variant: "destructive" }); return; }

    if (newStatus !== row.status) {
      await supabase.from("tab_collection_status_history").insert({
        tracking_id: row.id, old_status: row.status, new_status: newStatus,
        reason: "Abono registrado", changed_by: userId, changed_by_name: userName, is_manual: false,
      });
    }
    setSaving(false);
    toast({ title: "Abono registrado" });
    onClose(true);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
          <DialogDescription>
            Saldo pendiente: <strong>{formatCurrency(balance)}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Monto</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Fecha de pago</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <Label>Nota (opcional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar abono"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Payments history ----------

function PaymentsHistoryDialog({ row, onClose }: { row: TrackingRow; onClose: () => void }) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("tab_collection_payments")
        .select("id,amount,payment_date,note,created_at")
        .eq("tracking_id", row.id)
        .order("payment_date", { ascending: false });
      setPayments((data || []) as PaymentRow[]);
    })();
  }, [row.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abonos registrados</DialogTitle>
          <DialogDescription>Documento {row.document_number} — {row.third_party_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {payments.length === 0 && <p className="text-sm text-muted-foreground">Sin abonos registrados.</p>}
          {payments.map((p) => (
            <div key={p.id} className="text-sm border-l-2 border-primary pl-3 py-1">
              <span className="font-medium">{formatCurrency(Number(p.amount))}</span>
              <span className="text-muted-foreground"> — {p.payment_date}</span>
              {p.note && <div className="text-xs text-muted-foreground">{p.note}</div>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Status change ----------

function StatusChangeDialog({ row, onClose }: { row: TrackingRow; onClose: (r: boolean) => void }) {
  const [newStatus, setNewStatus] = useState<Status>(row.status);
  const [reason, setReason] = useState("");
  const [markFullyPaid, setMarkFullyPaid] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (reason.trim().length < 10) {
      toast({ title: "El motivo debe tener al menos 10 caracteres", variant: "destructive" });
      return;
    }
    if (newStatus === row.status && !markFullyPaid) {
      toast({ title: "No hay cambios", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { id: userId, name: userName } = await getCurrentUserInfo();

    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === "pagada" && markFullyPaid) {
      update.amount_paid = Number(row.amount_total);
    } else if (newStatus === "pendiente") {
      // Do not alter amount_paid automatically; leave as-is unless user chose to adjust
    }

    const { error: updErr } = await supabase.from("tab_collection_tracking").update(update as any).eq("id", row.id);
    if (updErr) { setSaving(false); toast({ title: "Error", description: updErr.message, variant: "destructive" }); return; }

    await supabase.from("tab_collection_status_history").insert({
      tracking_id: row.id, old_status: row.status, new_status: newStatus,
      reason: reason.trim(), changed_by: userId, changed_by_name: userName, is_manual: true,
    });
    setSaving(false);
    toast({ title: "Estatus actualizado" });
    onClose(true);
  };

  const balance = Number(row.amount_total) - Number(row.amount_paid);
  const showAdjust = newStatus === "pagada" && balance > 0.005;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar estatus</DialogTitle>
          <DialogDescription>Documento {row.document_number} — {row.third_party_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nuevo estatus</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="parcial">Parcial</SelectItem>
                <SelectItem value="pagada">Pagada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showAdjust && (
            <div className="flex items-start gap-2 rounded border p-3 bg-muted/40">
              <Checkbox id="fully-paid" checked={markFullyPaid} onCheckedChange={(v) => setMarkFullyPaid(!!v)} />
              <div className="text-sm">
                <Label htmlFor="fully-paid" className="cursor-pointer">
                  Marcar como completamente pagada (ajustar saldo a 0)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Saldo actual: {formatCurrency(balance)}
                </p>
              </div>
            </div>
          )}
          <div>
            <Label>Motivo (obligatorio)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Explica el motivo del cambio (mínimo 10 caracteres)" />
            <p className="text-xs text-muted-foreground mt-1">{reason.trim().length}/10 mínimo</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando…" : "Guardar cambio"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Status history ----------

function StatusHistoryDialog({ row, onClose }: { row: TrackingRow; onClose: () => void }) {
  const [items, setItems] = useState<StatusHistoryRow[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("tab_collection_status_history")
        .select("id,old_status,new_status,reason,changed_by_name,changed_at,is_manual")
        .eq("tracking_id", row.id)
        .order("changed_at", { ascending: false });
      setItems((data || []) as StatusHistoryRow[]);
    })();
  }, [row.id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Historial de estatus</DialogTitle>
          <DialogDescription>Documento {row.document_number} — {row.third_party_name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Sin registros.</p>}
          {items.map((h) => (
            <div key={h.id} className="text-sm border-l-2 border-primary pl-3 py-1">
              <span className="font-medium">
                {STATUS_LABEL[h.new_status as Status] ?? h.new_status}
              </span>
              {": "}
              <span>{h.changed_by_name || "Sistema"}</span>{" "}
              <span className="text-muted-foreground">
                — {new Date(h.changed_at).toLocaleString("es-GT")}
              </span>
              {h.reason && <div className="text-xs text-muted-foreground">Motivo: {h.reason}</div>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Initial balances ----------

function InitialBalancesDialog({
  enterpriseId, direction, onClose,
}: { enterpriseId: number; direction: "cxc" | "cxp"; onClose: (refreshed: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<LedgerCandidate[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<number, { checked: boolean; dueDate: string }>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // 1. Get tracking source_ledger_ids for this enterprise+direction
      const { data: existing } = await supabase.from("tab_collection_tracking")
        .select("source_ledger_id")
        .eq("enterprise_id", enterpriseId)
        .eq("direction", direction);
      const existingIds = new Set((existing || []).map((r: any) => Number(r.source_ledger_id)));

      // 2. Get default term days for enterprise
      const { data: term } = await supabase.from("tab_collection_terms")
        .select("days")
        .eq("enterprise_id", enterpriseId)
        .eq("is_default", true)
        .maybeSingle();
      const defaultDays = (term as any)?.days ?? 30;

      // 3. Fetch ledger
      const table = direction === "cxc" ? "tab_sales_ledger" : "tab_purchase_ledger";
      const nameCol = direction === "cxc" ? "customer_name" : "supplier_name";
      const { data: ledger } = await supabase
        .from(table as any)
        .select(`id,invoice_date,${nameCol},invoice_series,invoice_number,total_amount`)
        .eq("enterprise_id", enterpriseId)
        .order("invoice_date", { ascending: false })
        .limit(2000);

      const list: LedgerCandidate[] = ((ledger || []) as any[])
        .filter((l) => !existingIds.has(Number(l.id)))
        .map((l) => {
          const d = new Date(l.invoice_date + "T00:00:00");
          d.setDate(d.getDate() + Number(defaultDays));
          return {
            id: Number(l.id),
            invoice_date: l.invoice_date,
            third_party_name: l[nameCol] || "",
            document_number: [l.invoice_series, l.invoice_number].filter(Boolean).join("-"),
            total_amount: Number(l.total_amount) || 0,
            suggested_due_date: d.toISOString().slice(0, 10),
          };
        });

      setCandidates(list);
      setLoading(false);
    })();
  }, [enterpriseId, direction]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      c.third_party_name.toLowerCase().includes(q) ||
      c.document_number.toLowerCase().includes(q)
    );
  }, [candidates, search]);

  const toggle = (c: LedgerCandidate, checked: boolean) => {
    setSelected((prev) => ({
      ...prev,
      [c.id]: { checked, dueDate: prev[c.id]?.dueDate ?? c.suggested_due_date },
    }));
  };

  const setDate = (id: number, date: string) => {
    setSelected((prev) => ({ ...prev, [id]: { checked: prev[id]?.checked ?? false, dueDate: date } }));
  };

  const handleConfirm = async () => {
    const toInsert = candidates
      .filter((c) => selected[c.id]?.checked)
      .map((c) => ({
        enterprise_id: enterpriseId,
        direction,
        source_ledger_id: c.id,
        issue_date: c.invoice_date,
        due_date: selected[c.id].dueDate,
        amount_total: c.total_amount,
        amount_paid: 0,
        status: "pendiente" as const,
      }));
    if (toInsert.length === 0) {
      toast({ title: "Selecciona al menos una factura", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tab_collection_tracking").insert(toInsert);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `${toInsert.length} facturas cargadas` });
    onClose(true);
  };

  const selectedCount = Object.values(selected).filter((s) => s.checked).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cargar saldos iniciales</DialogTitle>
          <DialogDescription>
            Selecciona las facturas históricas que aún tienen saldo pendiente y ajusta el vencimiento si es necesario.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Buscar por nombre o número de documento…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="rounded border max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>{direction === "cxc" ? "Cliente" : "Proveedor"}</TableHead>
                  <TableHead>No. Doc</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Vencimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Cargando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">Sin facturas disponibles.</TableCell></TableRow>
                ) : filtered.map((c) => {
                  const sel = selected[c.id];
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox checked={!!sel?.checked} onCheckedChange={(v) => toggle(c, !!v)} />
                      </TableCell>
                      <TableCell>{c.invoice_date}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={c.third_party_name}>{c.third_party_name}</TableCell>
                      <TableCell>{c.document_number}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.total_amount)}</TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          className="h-8 w-[150px]"
                          value={sel?.dueDate ?? c.suggested_due_date}
                          onChange={(e) => setDate(c.id, e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="h-3 w-3" /> {selectedCount} factura(s) seleccionada(s)
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={saving || selectedCount === 0}>
            {saving ? "Guardando…" : `Cargar ${selectedCount || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

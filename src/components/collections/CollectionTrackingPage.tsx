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
      {statusTarget && selectedEnterprise && (
        <StatusChangeDialog
          row={statusTarget}
          enterpriseId={selectedEnterprise.id}
          direction={direction}
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

type PaymentMethod = "efectivo" | "cheque" | "transferencia" | "otro";
const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo", cheque: "Cheque", transferencia: "Transferencia", otro: "Otro",
};

interface BankAccountOption {
  id: number;
  bank_name: string;
  account_number: string;
  account_id: number | null;
}

async function fetchBankAccounts(enterpriseId: number): Promise<BankAccountOption[]> {
  const { data } = await supabase
    .from("tab_bank_accounts")
    .select("id,bank_name,account_number,account_id,is_active")
    .eq("enterprise_id", enterpriseId)
    .eq("is_active", true)
    .order("bank_name", { ascending: true });
  return ((data || []) as any[]).map((b) => ({
    id: Number(b.id), bank_name: b.bank_name, account_number: b.account_number, account_id: b.account_id ?? null,
  }));
}

function PaymentDialog({ row, onClose }: { row: TrackingRow; onClose: (r: boolean) => void }) {
  const balance = Number(row.amount_total) - Number(row.amount_paid);
  const [amount, setAmount] = useState<string>(balance.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("efectivo");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [banks, setBanks] = useState<BankAccountOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchBankAccounts(row.enterprise_id).then(setBanks); }, [row.enterprise_id]);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast({ title: "Monto inválido", variant: "destructive" }); return; }
    if (amt > balance + 0.005) { toast({ title: "El monto excede el saldo pendiente", variant: "destructive" }); return; }
    if (method === "transferencia" && !bankAccountId) {
      toast({ title: "Selecciona la cuenta bancaria", variant: "destructive" }); return;
    }
    setSaving(true);
    const { id: userId, name: userName } = await getCurrentUserInfo();
    const { error: payErr } = await supabase.from("tab_collection_payments").insert({
      tracking_id: row.id, amount: amt, payment_date: paymentDate, note: note || null, recorded_by: userId,
      payment_method: method,
      receipt_number: receiptNumber.trim() || null,
      bank_account_id: method === "transferencia" ? Number(bankAccountId) : null,
    } as any);
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
          <DialogDescription>Saldo pendiente: <strong>{formatCurrency(balance)}</strong></DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Monto</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Fecha de pago</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Forma de pago</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>
                <span className="inline-flex items-center gap-1.5">
                  <Receipt className="h-3.5 w-3.5 shrink-0" />
                  No. de recibo emitido
                </span>
              </Label>
              <Input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          {method === "transferencia" && (
            <div>
              <Label>Cuenta bancaria</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Selecciona la cuenta bancaria" /></SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.bank_name} — {b.account_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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
        .select("id,amount,payment_date,note,created_at,payment_method,receipt_number,bank_account_id,journal_entry_id")
        .eq("tracking_id", row.id)
        .order("payment_date", { ascending: false });
      const list = (data || []) as any[];
      const bankIds = Array.from(new Set(list.map((p) => p.bank_account_id).filter(Boolean)));
      const bankMap = new Map<number, { name: string; number: string }>();
      if (bankIds.length > 0) {
        const { data: banks } = await supabase.from("tab_bank_accounts")
          .select("id,bank_name,account_number").in("id", bankIds);
        (banks || []).forEach((b: any) => bankMap.set(Number(b.id), { name: b.bank_name, number: b.account_number }));
      }
      list.forEach((p) => {
        if (p.bank_account_id && bankMap.has(p.bank_account_id)) {
          const m = bankMap.get(p.bank_account_id)!;
          p.bank_name = m.name; p.bank_account_number = m.number;
        }
      });
      setPayments(list as PaymentRow[]);
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
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{formatCurrency(Number(p.amount))}</span>
                <span className="text-muted-foreground">— {p.payment_date}</span>
                {p.payment_method && (
                  <Badge variant="outline" className="text-xs">{METHOD_LABEL[p.payment_method as PaymentMethod] ?? p.payment_method}</Badge>
                )}
                {p.journal_entry_id && (
                  <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">En póliza</Badge>
                )}
              </div>
              {p.receipt_number && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Receipt className="h-3 w-3" /> Recibo: {p.receipt_number}
                </div>
              )}
              {p.bank_name && (
                <div className="text-xs text-muted-foreground">Banco: {p.bank_name} — {p.bank_account_number}</div>
              )}
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

      const rawList = ((ledger || []) as any[])
        .filter((l) => !existingIds.has(Number(l.id)))
        .map((l) => ({
          id: Number(l.id),
          invoice_date: l.invoice_date as string,
          third_party_name: l[nameCol] || "",
          document_number: [l.invoice_series, l.invoice_number].filter(Boolean).join("-"),
          total_amount: Number(l.total_amount) || 0,
        }));

      // Compute suggested_due_date via RPC (respects business-day adjustment).
      const list: LedgerCandidate[] = await Promise.all(
        rawList.map(async (l) => {
          let suggested: string;
          try {
            const { data: dueDate } = await supabase.rpc("calculate_due_date", {
              p_enterprise_id: enterpriseId,
              p_issue_date: l.invoice_date,
              p_term_days: Number(defaultDays),
            });
            if (dueDate) {
              suggested = String(dueDate);
            } else {
              const d = new Date(l.invoice_date + "T00:00:00");
              d.setDate(d.getDate() + Number(defaultDays));
              suggested = d.toISOString().slice(0, 10);
            }
          } catch {
            const d = new Date(l.invoice_date + "T00:00:00");
            d.setDate(d.getDate() + Number(defaultDays));
            suggested = d.toISOString().slice(0, 10);
          }
          return { ...l, suggested_due_date: suggested };
        })
      );

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

// ---------- Generar Póliza ----------

type GroupMode = "documento" | "dia" | "mes";

interface PendingPayment {
  id: number;
  tracking_id: number;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod | null;
  bank_account_id: number | null;
  receipt_number: string | null;
  source_ledger_id: number;
  third_party_name: string;
  document_number: string;
}

function GeneratePolizaDialog({
  enterpriseId, direction, onClose,
}: { enterpriseId: number; direction: "cxc" | "cxp"; onClose: (r: boolean) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";
  const [step, setStep] = useState<1 | 2>(1);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [mode, setMode] = useState<GroupMode>("dia");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [banks, setBanks] = useState<BankAccountOption[]>([]);
  // Resolver cuenta bancaria por grupo pendiente (efectivo/cheque/otro)
  const [methodBankAccount, setMethodBankAccount] = useState<Record<string, string>>({});

  useEffect(() => { fetchBankAccounts(enterpriseId).then(setBanks); }, [enterpriseId]);

  const loadPending = async () => {
    setLoading(true);
    // 1. tracking ids for this enterprise+direction
    const { data: tr } = await supabase.from("tab_collection_tracking")
      .select("id,source_ledger_id")
      .eq("enterprise_id", enterpriseId).eq("direction", direction);
    const trList = (tr || []) as any[];
    const trIds = trList.map((t) => Number(t.id));
    if (trIds.length === 0) { setPayments([]); setLoading(false); setStep(2); return; }

    // 2. pending payments
    const { data: pays } = await supabase.from("tab_collection_payments")
      .select("id,tracking_id,amount,payment_date,payment_method,bank_account_id,receipt_number,journal_entry_id")
      .in("tracking_id", trIds)
      .is("journal_entry_id", null)
      .gte("payment_date", dateFrom)
      .lte("payment_date", dateTo)
      .order("payment_date", { ascending: true });
    const payList = (pays || []) as any[];

    // 3. enrich third-party from ledger via tracking source_ledger_id
    const trMap = new Map<number, number>();
    trList.forEach((t) => trMap.set(Number(t.id), Number(t.source_ledger_id)));
    const ledgerIds = Array.from(new Set(payList.map((p) => trMap.get(Number(p.tracking_id))).filter(Boolean) as number[]));
    const ledgerMap = new Map<number, { name: string; doc: string }>();
    if (ledgerIds.length > 0) {
      const table = direction === "cxc" ? "tab_sales_ledger" : "tab_purchase_ledger";
      const nameCol = direction === "cxc" ? "customer_name" : "supplier_name";
      const { data: ledger } = await supabase.from(table as any)
        .select(`id,${nameCol},invoice_series,invoice_number`).in("id", ledgerIds);
      (ledger || []).forEach((l: any) => {
        ledgerMap.set(Number(l.id), {
          name: l[nameCol] || "", doc: [l.invoice_series, l.invoice_number].filter(Boolean).join("-"),
        });
      });
    }

    const enriched: PendingPayment[] = payList.map((p) => {
      const ledgerId = trMap.get(Number(p.tracking_id)) || 0;
      const info = ledgerMap.get(ledgerId);
      return {
        id: Number(p.id), tracking_id: Number(p.tracking_id), amount: Number(p.amount),
        payment_date: p.payment_date, payment_method: p.payment_method,
        bank_account_id: p.bank_account_id ? Number(p.bank_account_id) : null,
        receipt_number: p.receipt_number, source_ledger_id: ledgerId,
        third_party_name: info?.name || "—", document_number: info?.doc || "—",
      };
    });
    setPayments(enriched);
    setLoading(false);
    setStep(2);
  };

  // Groups needing bank account resolution
  const pendingMethodGroups = useMemo(() => {
    const groups: Record<string, { method: PaymentMethod; count: number; total: number }> = {};
    payments.forEach((p) => {
      const m = (p.payment_method || "otro") as PaymentMethod;
      if (m === "transferencia" && p.bank_account_id) return; // already resolved
      const key = m;
      if (!groups[key]) groups[key] = { method: m, count: 0, total: 0 };
      groups[key].count++;
      groups[key].total += p.amount;
    });
    return groups;
  }, [payments]);

  // Already-resolved transfer groups (informative)
  const resolvedTransferGroups = useMemo(() => {
    const g: Record<number, { count: number; total: number }> = {};
    payments.forEach((p) => {
      if (p.payment_method === "transferencia" && p.bank_account_id) {
        if (!g[p.bank_account_id]) g[p.bank_account_id] = { count: 0, total: 0 };
        g[p.bank_account_id].count++;
        g[p.bank_account_id].total += p.amount;
      }
    });
    return g;
  }, [payments]);

  const allResolved = useMemo(() => {
    return Object.keys(pendingMethodGroups).every((k) => !!methodBankAccount[k]);
  }, [pendingMethodGroups, methodBankAccount]);

  const resolveBank = (p: PendingPayment): number | null => {
    if (p.payment_method === "transferencia" && p.bank_account_id) return p.bank_account_id;
    const key = (p.payment_method || "otro") as string;
    const v = methodBankAccount[key];
    return v ? Number(v) : null;
  };

  const handleGenerate = async () => {
    if (payments.length === 0) { toast({ title: "No hay abonos pendientes en el rango" }); return; }
    if (!allResolved) { toast({ title: "Selecciona la cuenta bancaria para cada grupo", variant: "destructive" }); return; }

    setSaving(true);
    try {
      // Load enterprise config for third-party accounts
      const { data: cfg } = await supabase.from("tab_enterprise_config")
        .select("customers_account_id,suppliers_account_id")
        .eq("enterprise_id", enterpriseId).maybeSingle();
      const thirdPartyAccId = direction === "cxc"
        ? (cfg as any)?.customers_account_id
        : (cfg as any)?.suppliers_account_id;
      if (!thirdPartyAccId) {
        throw new Error(direction === "cxc"
          ? "Configura la cuenta de Clientes en Configuración de la empresa."
          : "Configura la cuenta de Proveedores en Configuración de la empresa.");
      }

      // bank id -> account_id (contable)
      const bankAccountMap = new Map<number, number>();
      banks.forEach((b) => { if (b.account_id) bankAccountMap.set(b.id, b.account_id); });

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      // Grouping key by mode
      const keyFor = (p: PendingPayment) => {
        if (mode === "documento") return `doc_${p.id}`;
        if (mode === "dia") return p.payment_date;
        return `${p.payment_date.slice(0, 7)}`; // yyyy-mm
      };

      const groups = new Map<string, PendingPayment[]>();
      payments.forEach((p) => {
        const k = keyFor(p);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(p);
      });

      let entriesCreated = 0;
      let totalAmount = 0;

      for (const [, list] of groups) {
        // entry_date
        const entryDate = mode === "mes"
          ? (() => {
              const ym = list[0].payment_date.slice(0, 7);
              const y = Number(ym.slice(0, 4)); const m = Number(ym.slice(5, 7));
              const last = new Date(y, m, 0).getDate();
              return `${ym}-${String(last).padStart(2, "0")}`;
            })()
          : list[0].payment_date;

        // Find accounting period
        const year = Number(entryDate.slice(0, 4));
        const { data: period } = await supabase.from("tab_accounting_periods")
          .select("id").eq("enterprise_id", enterpriseId).eq("year", year).maybeSingle();
        if (!period) throw new Error(`No hay período contable para el año ${year}`);

        const groupTotal = list.reduce((s, p) => s + p.amount, 0);
        totalAmount += groupTotal;

        const entryNumber = await allocateEntryNumber(String(enterpriseId), "diario", entryDate);
        const descBase = direction === "cxc" ? "Cobros" : "Pagos";
        const description = mode === "documento"
          ? `${descBase} — ${list[0].third_party_name} ${list[0].document_number}`
          : mode === "dia"
            ? `${descBase} del día ${entryDate}`
            : `${descBase} del mes ${entryDate.slice(0, 7)}`;

        const { data: je, error: jeErr } = await supabase.from("tab_journal_entries").insert({
          enterprise_id: enterpriseId, accounting_period_id: (period as any).id,
          entry_number: entryNumber, entry_date: entryDate, entry_type: "diario",
          description, total_debit: groupTotal, total_credit: groupTotal,
          is_posted: false, created_by: userId,
        } as any).select("id").single();
        if (jeErr) throw jeErr;
        const journalEntryId = Number((je as any).id);

        // Build detail lines: aggregate by bank account
        const bankAgg = new Map<number, number>(); // bank_account_id -> total
        let thirdPartyTotal = 0;
        list.forEach((p) => {
          const bid = resolveBank(p)!;
          bankAgg.set(bid, (bankAgg.get(bid) || 0) + p.amount);
          thirdPartyTotal += p.amount;
        });

        const details: any[] = [];
        let lineNumber = 1;
        // Debit/Credit assignment
        if (direction === "cxc") {
          // DEBIT bank(s), CREDIT third-party
          for (const [bankId, amt] of bankAgg) {
            const accId = bankAccountMap.get(bankId);
            if (!accId) throw new Error(`La cuenta bancaria seleccionada no tiene cuenta contable configurada.`);
            const b = banks.find((x) => x.id === bankId);
            details.push({
              journal_entry_id: journalEntryId, line_number: lineNumber++, account_id: accId,
              description: `${b?.bank_name || "Banco"} ${b?.account_number || ""}`.trim(),
              debit_amount: parseFloat(amt.toFixed(2)), credit_amount: 0,
            });
          }
          details.push({
            journal_entry_id: journalEntryId, line_number: lineNumber++, account_id: thirdPartyAccId,
            description, debit_amount: 0, credit_amount: parseFloat(thirdPartyTotal.toFixed(2)),
          });
        } else {
          // cxp: DEBIT third-party, CREDIT bank(s)
          details.push({
            journal_entry_id: journalEntryId, line_number: lineNumber++, account_id: thirdPartyAccId,
            description, debit_amount: parseFloat(thirdPartyTotal.toFixed(2)), credit_amount: 0,
          });
          for (const [bankId, amt] of bankAgg) {
            const accId = bankAccountMap.get(bankId);
            if (!accId) throw new Error(`La cuenta bancaria seleccionada no tiene cuenta contable configurada.`);
            const b = banks.find((x) => x.id === bankId);
            details.push({
              journal_entry_id: journalEntryId, line_number: lineNumber++, account_id: accId,
              description: `${b?.bank_name || "Banco"} ${b?.account_number || ""}`.trim(),
              debit_amount: 0, credit_amount: parseFloat(amt.toFixed(2)),
            });
          }
        }

        const { error: detErr } = await supabase.from("tab_journal_entry_details").insert(details);
        if (detErr) throw detErr;

        // Mark payments with journal_entry_id
        const paymentIds = list.map((p) => p.id);
        await supabase.from("tab_collection_payments")
          .update({ journal_entry_id: journalEntryId } as any).in("id", paymentIds);

        entriesCreated++;
      }

      toast({
        title: "Pólizas generadas",
        description: `${entriesCreated} póliza(s) creada(s) por un total de ${formatCurrency(totalAmount)}.`,
      });
      onClose(true);
    } catch (e: any) {
      toast({ title: "Error al generar póliza", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Generar Póliza de Abonos</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Selecciona el rango de fechas y cómo agrupar los abonos."
              : "Revisa los abonos pendientes de póliza y resuelve la cuenta bancaria para cada grupo."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Desde</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label>Hasta</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Modo de agrupación</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as GroupMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="documento">Póliza por Documento (una por abono)</SelectItem>
                  <SelectItem value="dia">Póliza por Día</SelectItem>
                  <SelectItem value="mes">Póliza Consolidada del Mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onClose(false)}>Cancelar</Button>
              <Button onClick={loadPending} disabled={loading}>{loading ? "Buscando…" : "Continuar"}</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay abonos pendientes de póliza en el rango seleccionado.
              </p>
            ) : (
              <>
                <div className="bg-muted p-3 rounded text-sm">
                  <p><strong>{payments.length}</strong> abonos · Total <strong>{formatCurrency(payments.reduce((s, p) => s + p.amount, 0))}</strong></p>
                  <p className="text-xs text-muted-foreground">Modo: {mode === "documento" ? "por documento" : mode === "dia" ? "por día" : "consolidada del mes"}</p>
                </div>

                {Object.entries(resolvedTransferGroups).map(([bankId, g]) => {
                  const b = banks.find((x) => x.id === Number(bankId));
                  return (
                    <div key={`resolved_${bankId}`} className="border rounded p-3 text-sm bg-emerald-50/50">
                      <p className="font-medium">{g.count} abono(s) por transferencia — {b?.bank_name} {b?.account_number}</p>
                      <p className="text-xs text-muted-foreground">Total {formatCurrency(g.total)} · Cuenta resuelta ✓</p>
                    </div>
                  );
                })}

                {Object.entries(pendingMethodGroups).map(([key, g]) => (
                  <div key={`pending_${key}`} className="border rounded p-3 space-y-2">
                    <p className="font-medium text-sm">
                      {g.count} abono(s) en {METHOD_LABEL[g.method]} — Total {formatCurrency(g.total)}
                    </p>
                    <div>
                      <Label className="text-xs">Cuenta bancaria/caja a usar</Label>
                      <Select
                        value={methodBankAccount[key] || ""}
                        onValueChange={(v) => setMethodBankAccount((prev) => ({ ...prev, [key]: v }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecciona la cuenta" /></SelectTrigger>
                        <SelectContent>
                          {banks.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>{b.bank_name} — {b.account_number}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Atrás</Button>
              <Button onClick={handleGenerate} disabled={saving || payments.length === 0 || !allResolved}>
                {saving ? "Generando…" : "Generar Póliza"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

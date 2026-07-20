import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, THead as TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileDown, Pencil, Clock, ShieldAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuotes, fetchQuoteItems, STATUS_LABELS, STATUS_BADGE_CLASS, type Quote, type QuoteStatus } from "@/hooks/useQuotes";
import { QuoteEditorDialog } from "@/components/cotizaciones/QuoteEditorDialog";
import { QuoteHistoryDialog } from "@/components/cotizaciones/QuoteHistoryDialog";
import { exportQuoteToPdf } from "@/components/cotizaciones/quoteExport";
import { formatCurrency } from "@/lib/utils";

export default function Cotizaciones() {
  const { isSuperAdmin, isLoading } = useTenant();
  const navigate = useNavigate();
  const { quotes, reload } = useQuotes();

  const [userId, setUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | QuoteStatus>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase.from("tab_users").select("full_name").eq("id", user.id).single();
      setUserName(data?.full_name || user.email || "Usuario");
    })();
  }, []);

  const filtered = useMemo(() => {
    return quotes.filter((q) => {
      if (statusFilter !== "all" && q.status !== statusFilter) return false;
      if (search && !q.client_name.toLowerCase().includes(search.toLowerCase()) &&
          !q.quote_number.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [quotes, search, statusFilter]);

  if (isLoading) return null;
  if (!isSuperAdmin) {
    return (
      <div className="p-8 max-w-xl mx-auto">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-destructive" /> Acceso restringido</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Este módulo solo está disponible para el super administrador.</p>
            <Button className="mt-4" onClick={() => navigate("/dashboard")}>Volver</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (q: Quote) => { setEditing(q); setEditorOpen(true); };
  const openHistory = (id: string) => { setHistoryId(id); setHistoryOpen(true); };

  const handlePdf = async (q: Quote) => {
    try {
      const items = await fetchQuoteItems(q.id);
      await exportQuoteToPdf(q, items);
    } catch (e) {
      toast({ title: "Error al generar PDF", description: e instanceof Error ? e.message : "", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Cotizá tus servicios contables a clientes.</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Nueva Cotización</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input placeholder="Buscar por cliente o número..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="elaborada">Elaborada</SelectItem>
            <SelectItem value="enviada">Enviada</SelectItem>
            <SelectItem value="confirmada">Confirmada</SelectItem>
            <SelectItem value="no_aceptada">No aceptada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin cotizaciones.</TableCell></TableRow>
              )}
              {filtered.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-xs">{q.quote_number}</TableCell>
                  <TableCell>{q.client_name}</TableCell>
                  <TableCell>{q.issue_date}</TableCell>
                  <TableCell>{q.valid_until ?? "—"}</TableCell>
                  <TableCell className="text-right">Q {formatCurrency(Number(q.total))}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE_CLASS[q.status]}`}>{STATUS_LABELS[q.status]}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(q)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openHistory(q.id)} title="Historial"><Clock className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handlePdf(q)} title="PDF"><FileDown className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <QuoteEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        quote={editing}
        onSaved={reload}
        currentUserId={userId}
        currentUserName={userName}
      />
      <QuoteHistoryDialog quoteId={historyId} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}

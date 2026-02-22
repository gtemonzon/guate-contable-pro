import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ShoppingCart } from "lucide-react";
import JournalEntryHistoryTimeline from "./JournalEntryHistoryTimeline";
import EntityAuditLog from "@/components/audit/EntityAuditLog";

interface JournalEntryDetail {
  line_number: number;
  account_code: string;
  account_name: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
}

interface JournalEntryFull {
  id: number;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  status: string;
  is_posted: boolean;
  created_by_name?: string;
  created_at?: string;
  updated_by_name?: string;
  updated_at?: string;
  details: JournalEntryDetail[];
}

interface LinkedPurchase {
  id: number;
  invoice_series: string | null;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string | null;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number | null;
  vat_amount: number;
}

interface JournalEntryViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: number | null;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("es-GT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDateTime = (dateString?: string) => {
  if (!dateString) return "";
  return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: es });
};

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  pendiente_revision: "Pendiente Revisión",
  aprobado: "Aprobado",
  contabilizado: "Contabilizado",
  rechazado: "Rechazado",
};

export default function JournalEntryViewDialog({
  open,
  onOpenChange,
  entryId,
}: JournalEntryViewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<JournalEntryFull | null>(null);
  const [activeTab, setActiveTab] = useState("detalle");
  const [scrolled, setScrolled] = useState(false);
  const [linkedPurchases, setLinkedPurchases] = useState<LinkedPurchase[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && entryId) {
      fetchEntry(entryId);
      fetchLinkedPurchases(entryId);
      setScrolled(false);
    } else {
      setEntry(null);
      setLinkedPurchases([]);
      setPurchasesLoaded(false);
    }
  }, [open, entryId]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolled(e.currentTarget.scrollTop > 40);
  };

  const fetchLinkedPurchases = async (id: number) => {
    try {
      // 1) Direct link via journal_entry_id
      const { data: directData, error: directError } = await supabase
        .from("tab_purchase_ledger")
        .select("id, invoice_series, invoice_number, invoice_date, fel_document_type, supplier_nit, supplier_name, total_amount, base_amount, vat_amount")
        .eq("journal_entry_id", id)
        .is("deleted_at", null)
        .order("created_at");
      if (directError) throw directError;

      let results = directData || [];

      // 2) If no direct links, try matching via source_ref in journal entry details
      if (results.length === 0) {
        const { data: details } = await supabase
          .from("tab_journal_entry_details")
          .select("source_ref")
          .eq("journal_entry_id", id)
          .eq("source_type", "PURCHASE")
          .is("deleted_at", null);

        if (details && details.length > 0) {
          const invoiceNumbers = new Set<string>();
          details.forEach((d: any) => {
            if (d.source_ref) {
              d.source_ref.split(",").forEach((ref: string) => {
                const cleaned = ref.trim().replace(/^FACT\s+/i, "");
                if (cleaned) {
                  invoiceNumbers.add(cleaned);
                  // Also add the part after the last hyphen (series-number format)
                  const lastHyphen = cleaned.lastIndexOf("-");
                  if (lastHyphen > 0) {
                    invoiceNumbers.add(cleaned.substring(lastHyphen + 1));
                  }
                }
              });
            }
          });

          if (invoiceNumbers.size > 0) {
            const { data: refData, error: refError } = await supabase
              .from("tab_purchase_ledger")
              .select("id, invoice_series, invoice_number, invoice_date, fel_document_type, supplier_nit, supplier_name, total_amount, base_amount, vat_amount")
              .in("invoice_number", Array.from(invoiceNumbers))
              .is("deleted_at", null)
              .order("created_at");
            if (refError) throw refError;
            results = refData || [];
          }
        }
      }

      setLinkedPurchases(results);
    } catch (error) {
      console.error("Error fetching linked purchases:", error);
    } finally {
      setPurchasesLoaded(true);
    }
  };

  const fetchEntry = async (id: number) => {
    try {
      setLoading(true);

      const { data: entryData, error: entryError } = await supabase
        .from("tab_journal_entries")
        .select(`
          *,
          creator:tab_users!tab_journal_entries_created_by_fkey(full_name),
          modifier:tab_users!tab_journal_entries_updated_by_fkey(full_name)
        `)
        .eq("id", id)
        .single();

      if (entryError) throw entryError;

      const { data: details, error: detailsError } = await supabase
        .from("tab_journal_entry_details")
        .select(`
          *,
          tab_accounts!inner (
            account_code,
            account_name
          )
        `)
        .eq("journal_entry_id", id)
        .is("deleted_at", null)
        .order("line_number");

      if (detailsError) throw detailsError;

      const journalEntry: JournalEntryFull = {
        ...entryData,
        created_by_name: entryData.creator?.full_name,
        updated_by_name: entryData.modifier?.full_name,
        details: (details || []).map((d: any) => ({
          line_number: d.line_number,
          account_code: d.tab_accounts.account_code,
          account_name: d.tab_accounts.account_name,
          description: d.description,
          debit_amount: Number(d.debit_amount) || 0,
          credit_amount: Number(d.credit_amount) || 0,
        })),
      };

      setEntry(journalEntry);
    } catch (error) {
      console.error("Error fetching journal entry:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        {/* Sticky collapsible header */}
        <div
          className={`sticky top-0 z-10 flex flex-col px-6 pt-6 transition-all duration-200 ${
            scrolled
              ? "pb-3 bg-muted/80 backdrop-blur-sm border-b shadow-sm"
              : "pb-0 bg-transparent"
          }`}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              Detalle de Partida
              {scrolled && entry && (
                <span className="text-sm font-normal text-muted-foreground">
                  · {entry.entry_number} · {entry.entry_date}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {entry && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3">
              <TabsList>
                <TabsTrigger value="detalle">Detalle</TabsTrigger>
                {purchasesLoaded && linkedPurchases.length > 0 && (
                  <TabsTrigger value="compras" className="gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Compras
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {linkedPurchases.length}
                    </Badge>
                  </TabsTrigger>
                )}
                <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto px-6 pb-6 pt-4"
          onScroll={handleScroll}
          ref={contentRef}
        >
          {loading ? (
            <p className="text-center text-muted-foreground py-8">
              Cargando partida...
            </p>
          ) : entry ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              {/* Hidden TabsList — navigation is in the sticky header above */}
              <TabsList className="hidden" />

              <TabsContent value="detalle">
                <div className="space-y-4">
                  {/* Header Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">No. Partida</p>
                      <p className="font-semibold">{entry.entry_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Fecha</p>
                      <p className="font-semibold">{entry.entry_date}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tipo</p>
                      <p className="font-semibold capitalize">{entry.entry_type}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Estado</p>
                      <Badge
                        variant={
                          entry.status === "contabilizado"
                            ? "default"
                            : entry.status === "rechazado"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {STATUS_LABELS[entry.status] || entry.status}
                      </Badge>
                    </div>
                    <div className="col-span-2 md:col-span-4">
                      <p className="text-sm text-muted-foreground">Descripción</p>
                      <p className="font-semibold">{entry.description}</p>
                    </div>
                  </div>

                  {/* Details Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Línea</TableHead>
                        <TableHead className="w-[120px]">Código</TableHead>
                        <TableHead>Cuenta</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-right w-[120px]">Debe</TableHead>
                        <TableHead className="text-right w-[120px]">Haber</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entry.details.map((detail) => (
                        <TableRow key={detail.line_number}>
                          <TableCell>{detail.line_number}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {detail.account_code}
                          </TableCell>
                          <TableCell>{detail.account_name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {detail.description || "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {detail.debit_amount > 0
                              ? formatCurrency(detail.debit_amount)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {detail.credit_amount > 0
                              ? formatCurrency(detail.credit_amount)
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals Row */}
                      <TableRow className="font-semibold bg-muted">
                        <TableCell colSpan={4} className="text-right">
                          Total
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(entry.total_debit)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(entry.total_credit)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  {/* Audit Info */}
                  <div className="text-xs text-muted-foreground border-t pt-3 mt-4 space-y-1">
                    {entry.created_by_name && (
                      <p>
                        <span className="font-medium">Creado por:</span>{" "}
                        {entry.created_by_name} - {formatDateTime(entry.created_at)}
                      </p>
                    )}
                    {entry.updated_by_name && entry.updated_at && (
                      <p>
                        <span className="font-medium">Modificado por:</span>{" "}
                        {entry.updated_by_name} - {formatDateTime(entry.updated_at)}
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {linkedPurchases.length > 0 && (
                <TabsContent value="compras">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {linkedPurchases.length} factura(s) de compra vinculada(s) a esta partida.
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Serie/Número</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead>NIT</TableHead>
                          <TableHead>Proveedor</TableHead>
                          <TableHead className="text-right">Base</TableHead>
                          <TableHead className="text-right">IVA</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {linkedPurchases.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {p.fel_document_type || "FACT"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {p.invoice_series ? `${p.invoice_series}-` : ""}{p.invoice_number}
                            </TableCell>
                            <TableCell>{p.invoice_date}</TableCell>
                            <TableCell className="font-mono text-sm">{p.supplier_nit}</TableCell>
                            <TableCell>{p.supplier_name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(p.base_amount ?? 0)}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(p.vat_amount)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {formatCurrency(p.total_amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold bg-muted">
                          <TableCell colSpan={5} className="text-right">Total</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(linkedPurchases.reduce((s, p) => s + (p.base_amount ?? 0), 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(linkedPurchases.reduce((s, p) => s + p.vat_amount, 0))}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(linkedPurchases.reduce((s, p) => s + p.total_amount, 0))}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              )}

              <TabsContent value="auditoria">
                <EntityAuditLog
                  entityType="tab_journal_entries"
                  entityId={entryId}
                  visible={activeTab === "auditoria"}
                  showHashChain={true}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No se encontró la partida
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

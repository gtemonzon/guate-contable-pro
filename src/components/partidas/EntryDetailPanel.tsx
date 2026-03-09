import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ShoppingCart, Edit, RotateCcw, X, BookOpen, Landmark, BookOpenCheck, Link2, FileEdit, AlertTriangle, CheckCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ReferencesFullList, ReferenceBadges } from "./ReferenceBadges";
import EntityAuditLog from "@/components/audit/EntityAuditLog";
import EntityLink, { type DateContext } from "@/components/ui/entity-link";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";

// --- Types ---
interface EntryLine {
  line_number: number;
  account_code: string;
  account_name: string;
  account_id: number;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
}

interface EntryData {
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
  beneficiary_name?: string | null;
  document_reference?: string | null;
  bank_reference?: string | null;
  bank_account_id?: number | null;
  accounting_period_id?: number | null;
  reversal_entry_id?: number | null;
  reversed_by_entry_id?: number | null;
  details: EntryLine[];
}

interface LinkedPurchase {
  id: number;
  invoice_series: string | null;
  invoice_number: string;
  invoice_date: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

/** Derive year-based date range from an entry date string */
function deriveDateContextFromDate(entryDate: string): DateContext {
  const year = new Date(entryDate + "T00:00:00").getFullYear();
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  pendiente_revision: "Pendiente Revisión",
  aprobado: "Aprobado",
  contabilizado: "Contabilizado",
  rechazado: "Rechazado",
};

interface EntryDetailPanelProps {
  entryId: number | null;
  onClose: () => void;
  onEdit?: (entryId: number) => void;
  onVoid?: (entryId: number) => void;
}

export default function EntryDetailPanel({ entryId, onClose, onEdit, onVoid }: EntryDetailPanelProps) {
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState<EntryData | null>(null);
  const [linkedPurchases, setLinkedPurchases] = useState<LinkedPurchase[]>([]);
  const [activeTab, setActiveTab] = useState("detalle");
  const [dateContext, setDateContext] = useState<DateContext | null>(null);
  const [reversalInfo, setReversalInfo] = useState<{ entry_number: string; status: string; id: number } | null>(null);
  const [reversedByInfo, setReversedByInfo] = useState<{ entry_number: string; id: number } | null>(null);
  const [postingReversal, setPostingReversal] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (entryId) {
      fetchEntry(entryId);
      fetchLinkedPurchases(entryId);
      setActiveTab("detalle");
    } else {
      setEntry(null);
      setLinkedPurchases([]);
      setDateContext(null);
      setReversalInfo(null);
      setReversedByInfo(null);
    }
  }, [entryId]);

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
        .select(`*, tab_accounts!inner(id, account_code, account_name)`)
        .eq("journal_entry_id", id)
        .is("deleted_at", null)
        .order("line_number");
      if (detailsError) throw detailsError;

      setEntry({
        ...entryData,
        created_by_name: entryData.creator?.full_name,
        updated_by_name: entryData.modifier?.full_name,
        accounting_period_id: entryData.accounting_period_id,
        reversal_entry_id: entryData.reversal_entry_id,
        reversed_by_entry_id: entryData.reversed_by_entry_id,
        details: (details || []).map((d: any) => ({
          line_number: d.line_number,
          account_code: d.tab_accounts.account_code,
          account_name: d.tab_accounts.account_name,
          account_id: d.tab_accounts.id,
          description: d.description,
          debit_amount: Number(d.debit_amount) || 0,
          credit_amount: Number(d.credit_amount) || 0,
        })),
      });

      // Fetch linked reversal info
      if (entryData.reversal_entry_id) {
        const { data: revData } = await supabase
          .from("tab_journal_entries")
          .select("id, entry_number, status")
          .eq("id", entryData.reversal_entry_id)
          .single();
        setReversalInfo(revData ? { entry_number: revData.entry_number, status: revData.status || 'borrador', id: revData.id } : null);
      } else {
        setReversalInfo(null);
      }

      // Fetch "reversed by" info (this is a REV- entry pointing back)
      if (entryData.reversed_by_entry_id) {
        const { data: origData } = await supabase
          .from("tab_journal_entries")
          .select("id, entry_number")
          .eq("id", entryData.reversed_by_entry_id)
          .single();
        setReversedByInfo(origData ? { entry_number: origData.entry_number, id: origData.id } : null);
      } else {
        setReversedByInfo(null);
      }

      // Derive date context from accounting period or entry date
      if (entryData.accounting_period_id) {
        const { data: period } = await supabase
          .from("tab_accounting_periods")
          .select("start_date, end_date")
          .eq("id", entryData.accounting_period_id)
          .single();
        if (period) {
          setDateContext({ dateFrom: period.start_date, dateTo: period.end_date });
        } else {
          setDateContext(deriveDateContextFromDate(entryData.entry_date));
        }
      } else {
        setDateContext(deriveDateContextFromDate(entryData.entry_date));
      }
    } catch (error) {
      console.error("Error fetching entry:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkedPurchases = async (id: number) => {
    try {
      const { data } = await supabase
        .from("tab_purchase_ledger")
        .select("id, invoice_series, invoice_number, invoice_date, supplier_nit, supplier_name, total_amount")
        .eq("journal_entry_id", id)
        .is("deleted_at", null);
      setLinkedPurchases(data || []);
    } catch {}
  };

  if (!entryId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <BookOpen className="h-10 w-10 mx-auto opacity-30" />
          <p>Selecciona una partida para ver su detalle</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!entry) return null;

  const handleCopyLink = () => {
    if (!entry) return;
    const url = `${window.location.origin}/partidas?viewEntry=${entry.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Enlace copiado" });
  };

  const handleNavigateToMayor = () => {
    if (!entry) return;
    const uniqueAccounts = [...new Map(entry.details.map(d => [d.account_id, d])).values()];
    if (uniqueAccounts.length === 0) return;
    const firstAccount = uniqueAccounts[0];
    let url = `/mayor?accountId=${firstAccount.account_id}`;
    if (dateContext) url += `&startDate=${dateContext.dateFrom}&endDate=${dateContext.dateTo}`;
    navigate(url);
  };

  const handleNavigateToBancos = () => {
    if (!entry) return;
    let url = `/reportes?tab=bancos&bankAccountId=${entry.bank_account_id}`;
    if (dateContext) url += `&dateFrom=${dateContext.dateFrom}&dateTo=${dateContext.dateTo}`;
    navigate(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm truncate">{entry.entry_number}</span>
          <Badge
            variant={
              entry.status === "contabilizado" ? "default"
                : entry.status === "rechazado" ? "destructive"
                : "secondary"
            }
            className="text-xs shrink-0"
          >
            {STATUS_LABELS[entry.status] || entry.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(entry.id)}>
                  {entry.status === 'contabilizado' ? (
                    <FileEdit className="h-3.5 w-3.5" />
                  ) : (
                    <Edit className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{entry.status === 'contabilizado' ? 'Editar datos no contables' : 'Editar partida'}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onVoid && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600" onClick={() => onVoid(entry.id)}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Action Bar removed — merged into unified tabs below */}

      {/* Reversal banners */}
      {reversalInfo && (
        <div className={`mx-4 mt-2 flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
          reversalInfo.status === 'contabilizado'
            ? 'bg-destructive/10 border-destructive/30 text-destructive'
            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
        }`}>
          <RotateCcw className="h-4 w-4 flex-shrink-0" />
          <div className="flex-1">
            {reversalInfo.status === 'contabilizado' ? (
              <span className="font-medium">Revertida por {reversalInfo.entry_number}</span>
            ) : (
              <span>Corrección pendiente: <strong>{reversalInfo.entry_number}</strong> no contabilizada aún.</span>
            )}
          </div>
          {reversalInfo.status !== 'contabilizado' && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] px-2 border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30"
              disabled={postingReversal}
              onClick={async () => {
                try {
                  setPostingReversal(true);
                  const { error } = await supabase
                    .from("tab_journal_entries")
                    .update({ status: "contabilizado", is_posted: true, posted_at: new Date().toISOString() })
                    .eq("id", reversalInfo.id);
                  if (error) throw error;
                  toast({ title: "Reversión contabilizada", description: `${reversalInfo.entry_number} fue contabilizada.` });
                  if (entryId) fetchEntry(entryId);
                } catch (err: any) {
                  toast({ title: "Error", description: getSafeErrorMessage(err), variant: "destructive" });
                } finally {
                  setPostingReversal(false);
                }
              }}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Contabilizar reversión
            </Button>
          )}
        </div>
      )}

      {reversedByInfo && (
        <div className="mx-4 mt-2 flex items-center gap-2 p-2.5 rounded-lg border text-xs bg-muted/50 border-border text-muted-foreground">
          <RotateCcw className="h-4 w-4 flex-shrink-0" />
          <span>Esta partida es reversión de <strong>{reversedByInfo.entry_number}</strong></span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(val) => {
        if (val === "mayor") { handleNavigateToMayor(); return; }
        if (val === "bancos") { handleNavigateToBancos(); return; }
        setActiveTab(val);
      }} className="flex-1 flex flex-col min-h-0">
        <div className="mx-4 mt-2 shrink-0 flex items-center gap-1">
          <TabsList className="flex-1">
            <TabsTrigger value="detalle" className="text-xs">Detalle</TabsTrigger>
            {linkedPurchases.length > 0 && (
              <TabsTrigger value="compras" className="text-xs gap-1">
                <ShoppingCart className="h-3 w-3" />
                Compras ({linkedPurchases.length})
              </TabsTrigger>
            )}
            <TabsTrigger value="mayor" className="text-xs gap-1">
              <BookOpenCheck className="h-3 w-3" />
              Mayor
            </TabsTrigger>
            {entry.bank_account_id && (
              <TabsTrigger value="bancos" className="text-xs gap-1">
                <Landmark className="h-3 w-3" />
                Bancos
              </TabsTrigger>
            )}
            <TabsTrigger value="auditoria" className="text-xs">Auditoría</TabsTrigger>
          </TabsList>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={handleCopyLink}>
                <Link2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">Copiar enlace</TooltipContent>
          </Tooltip>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-4 py-3">
            <TabsContent value="detalle" className="mt-0 space-y-3">
              {/* Entry metadata */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Fecha</span>
                  <p className="font-medium">{entry.entry_date}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Tipo</span>
                  <p className="font-medium capitalize">{entry.entry_type}</p>
                </div>
              </div>

              <div className="text-xs">
                <span className="text-muted-foreground">Descripción</span>
                <p className="font-medium">{entry.description}</p>
              </div>

              {entry.beneficiary_name && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Beneficiario</span>
                  <p className="font-medium">{entry.beneficiary_name}</p>
                </div>
              )}

              {(entry.document_reference || entry.bank_reference) && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {entry.document_reference && (
                    <div>
                      <span className="text-muted-foreground">Ref. Documento</span>
                      <p className="font-medium">{entry.document_reference}</p>
                    </div>
                  )}
                  {entry.bank_reference && (
                    <div>
                      <span className="text-muted-foreground">Ref. Bancaria</span>
                      <p className="font-medium">{entry.bank_reference}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Lines table with EntityLink */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-1.5 w-[90px]">Código</TableHead>
                    <TableHead className="text-xs py-1.5">Cuenta</TableHead>
                    <TableHead className="text-xs py-1.5 text-right w-[90px]">Debe</TableHead>
                    <TableHead className="text-xs py-1.5 text-right w-[90px]">Haber</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entry.details.map((d) => (
                    <TableRow key={d.line_number} className="group">
                      <TableCell className="text-xs py-1.5">
                        <EntityLink
                          type="account"
                          label={d.account_code}
                          id={d.account_id}
                          secondaryLabel={d.account_name}
                          dateContext={dateContext ?? undefined}
                        />
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        {d.account_name}
                        {d.description && (
                          <span className="block text-muted-foreground text-[10px]">{d.description}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono">
                        {d.debit_amount > 0 ? formatCurrency(d.debit_amount) : "-"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right font-mono">
                        {d.credit_amount > 0 ? formatCurrency(d.credit_amount) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold bg-muted">
                    <TableCell colSpan={2} className="text-xs py-1.5 text-right">Total</TableCell>
                    <TableCell className="text-xs py-1.5 text-right font-mono">{formatCurrency(entry.total_debit)}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right font-mono">{formatCurrency(entry.total_credit)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Audit footer */}
              <div className="text-[10px] text-muted-foreground border-t pt-2 space-y-0.5">
                {entry.created_by_name && (
                  <p>Creado: {entry.created_by_name} · {entry.created_at ? format(new Date(entry.created_at), "dd/MM/yy HH:mm", { locale: es }) : ""}</p>
                )}
                {entry.updated_by_name && entry.updated_at && (
                  <p>Editado: {entry.updated_by_name} · {format(new Date(entry.updated_at), "dd/MM/yy HH:mm", { locale: es })}</p>
                )}
              </div>
            </TabsContent>

            {linkedPurchases.length > 0 && (
              <TabsContent value="compras" className="mt-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {linkedPurchases.length} factura(s) vinculada(s)
                </p>
                {linkedPurchases.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-md border text-xs group">
                    <div>
                      <p className="font-medium">
                        {p.invoice_series ? `${p.invoice_series}-` : ""}{p.invoice_number}
                      </p>
                      <p className="text-muted-foreground">{p.supplier_name} · {p.supplier_nit}</p>
                    </div>
                    <span className="font-mono font-semibold">{formatCurrency(p.total_amount)}</span>
                  </div>
                ))}
              </TabsContent>
            )}

            <TabsContent value="auditoria" className="mt-0">
              <EntityAuditLog entityType="tab_journal_entries" entityId={entry.id} />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

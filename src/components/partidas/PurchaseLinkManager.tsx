import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Link2, Unlink, Search, FileText, ArrowRight, Plus, RefreshCw, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { QuickPurchaseForm } from "./QuickPurchaseForm";
import { PurchaseLinkSummary } from "./PurchaseLinkSummary";

interface PurchaseLinkManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number;
  journalEntryId: number;
  journalEntryNumber: string;
  entryStatus: string;
  entryDate: string;
  entryMonth?: number;
  entryYear?: number;
  bankAccountId?: number | null;
  onLinksChanged?: () => void;
  onApplyToEntry?: () => void;
}

export interface PurchaseRecord {
  id: number;
  invoice_date: string;
  invoice_series: string | null;
  invoice_number: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  vat_amount: number;
  batch_reference: string | null;
  bank_account_id: number | null;
  expense_account_id: number | null;
}

export function PurchaseLinkManager({
  open, onOpenChange, enterpriseId, journalEntryId, journalEntryNumber,
  entryStatus, entryDate, entryMonth, entryYear, bankAccountId,
  onLinksChanged, onApplyToEntry,
}: PurchaseLinkManagerProps) {
  const [unlinkedPurchases, setUnlinkedPurchases] = useState<PurchaseRecord[]>([]);
  const [linkedPurchases, setLinkedPurchases] = useState<PurchaseRecord[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: number; account_code: string; account_name: string }>>([]);
  const [felDocTypes, setFelDocTypes] = useState<Array<{ code: string; name: string }>>([]);
  const { toast } = useToast();

  const selectCols = "id, invoice_date, invoice_series, invoice_number, fel_document_type, supplier_nit, supplier_name, total_amount, vat_amount, batch_reference, bank_account_id, expense_account_id";

  const loadData = useCallback(async () => {
    if (!open || !enterpriseId || !journalEntryId) return;
    setLoading(true);
    try {
      const { data: links } = await supabase
        .from("tab_purchase_journal_links" as any)
        .select("purchase_id")
        .eq("journal_entry_id", journalEntryId)
        .eq("enterprise_id", enterpriseId);

      const linkedIds = (links || []).map((l: any) => l.purchase_id);

      const { data: legacyLinked } = await supabase
        .from("tab_purchase_ledger")
        .select("id")
        .eq("enterprise_id", enterpriseId)
        .eq("journal_entry_id", journalEntryId)
        .is("deleted_at", null);

      const allLinkedIds = [...new Set([...linkedIds, ...(legacyLinked || []).map(l => l.id)])];

      if (allLinkedIds.length > 0) {
        const { data: linkedData } = await supabase
          .from("tab_purchase_ledger")
          .select(selectCols)
          .in("id", allLinkedIds)
          .is("deleted_at", null)
          .order("invoice_date");
        setLinkedPurchases(linkedData || []);
      } else {
        setLinkedPurchases([]);
      }

      let query = supabase
        .from("tab_purchase_ledger")
        .select(selectCols)
        .eq("enterprise_id", enterpriseId)
        .is("deleted_at", null)
        .is("journal_entry_id", null)
        .order("invoice_date");

      if (entryMonth && entryYear) {
        const startDate = `${entryYear}-${String(entryMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(entryYear, entryMonth, 0).getDate();
        const endDate = `${entryYear}-${String(entryMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        query = query.gte("invoice_date", startDate).lte("invoice_date", endDate);
      }

      const { data: unlinked } = await query;
      const filteredUnlinked = (unlinked || []).filter(p => !allLinkedIds.includes(p.id));
      setUnlinkedPurchases(filteredUnlinked);
    } catch (err) {
      console.error("Error loading purchase links:", err);
    } finally {
      setLoading(false);
    }
  }, [open, enterpriseId, journalEntryId, entryMonth, entryYear]);

  const loadReferenceData = useCallback(async () => {
    if (!open || !enterpriseId) return;
    try {
      const [{ data: accts }, { data: docTypes }] = await Promise.all([
        supabase.from("tab_accounts").select("id, account_code, account_name")
          .eq("enterprise_id", enterpriseId).eq("allows_movement", true).eq("is_active", true).order("account_code"),
        supabase.from("tab_fel_document_types").select("code, name").eq("is_active", true).order("name"),
      ]);
      setAccounts(accts || []);
      setFelDocTypes(docTypes || []);
    } catch (err) {
      console.error("Error loading reference data:", err);
    }
  }, [open, enterpriseId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadReferenceData(); }, [loadReferenceData]);

  const handleLink = async (purchase: PurchaseRecord) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      await supabase
        .from("tab_purchase_journal_links" as any)
        .upsert({
          enterprise_id: enterpriseId,
          purchase_id: purchase.id,
          journal_entry_id: journalEntryId,
          link_source: 'MANUAL_LINK',
          linked_by: user.id,
          linked_at: new Date().toISOString(),
        }, { onConflict: "enterprise_id,purchase_id" });

      setUnlinkedPurchases(prev => prev.filter(p => p.id !== purchase.id));
      setLinkedPurchases(prev => [...prev, purchase]);
      onLinksChanged?.();
      toast({ title: "Factura vinculada", description: `${purchase.supplier_name} - ${purchase.invoice_number}` });
    } catch (err: any) {
      toast({ title: "Error al vincular", description: err.message, variant: "destructive" });
    }
  };

  const handleUnlink = async (purchase: PurchaseRecord) => {
    try {
      await supabase
        .from("tab_purchase_journal_links" as any)
        .delete()
        .eq("enterprise_id", enterpriseId)
        .eq("purchase_id", purchase.id);

      setLinkedPurchases(prev => prev.filter(p => p.id !== purchase.id));
      setUnlinkedPurchases(prev => [...prev, purchase].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)));
      onLinksChanged?.();
      toast({ title: "Factura desvinculada", description: `${purchase.supplier_name} - ${purchase.invoice_number}` });
    } catch (err: any) {
      toast({ title: "Error al desvincular", description: err.message, variant: "destructive" });
    }
  };

  const handleInvoiceCreated = () => {
    loadData();
    onLinksChanged?.();
  };

  const filteredUnlinked = search
    ? unlinkedPurchases.filter(p =>
        p.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
        p.supplier_nit.toLowerCase().includes(search.toLowerCase()) ||
        p.invoice_number.toLowerCase().includes(search.toLowerCase())
      )
    : unlinkedPurchases;

  const PurchaseRow = ({ purchase, action, actionIcon, actionLabel }: {
    purchase: PurchaseRecord;
    action: () => void;
    actionIcon: React.ReactNode;
    actionLabel: string;
  }) => (
    <div className="flex items-center gap-3 py-2 px-3 rounded-md border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium truncate">{purchase.supplier_name}</span>
          {purchase.batch_reference && (
            <Badge variant="outline" className="text-[10px] shrink-0">CH: {purchase.batch_reference}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span>{purchase.invoice_date}</span>
          <span>•</span>
          <span>{purchase.fel_document_type} {purchase.invoice_series ? `${purchase.invoice_series}-` : ''}{purchase.invoice_number}</span>
          <span>•</span>
          <span className="font-mono">{formatCurrency(purchase.total_amount)}</span>
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={action} title={actionLabel} className="shrink-0">
        {actionIcon}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Facturas
          </DialogTitle>
        </DialogHeader>

        <PurchaseLinkSummary
          linkedPurchases={linkedPurchases}
          entryStatus={entryStatus}
          journalEntryNumber={journalEntryNumber}
          bankAccountId={bankAccountId}
          accounts={accounts}
          onApplyToEntry={onApplyToEntry}
        />

        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
          {/* Left: Available + Create */}
          <div className="flex flex-col border rounded-lg overflow-hidden">
            <Tabs defaultValue="disponibles" className="flex flex-col flex-1 min-h-0">
              <div className="p-2 border-b bg-muted/30">
                <TabsList className="w-full">
                  <TabsTrigger value="disponibles" className="flex-1 text-xs">
                    Disponibles ({filteredUnlinked.length})
                  </TabsTrigger>
                  <TabsTrigger value="crear" className="flex-1 text-xs">
                    <Plus className="h-3 w-3 mr-1" />
                    Crear Nueva
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="disponibles" className="flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden">
                <div className="p-3 border-b">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar proveedor, NIT, número..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  {entryMonth && entryYear && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {new Date(entryYear, entryMonth - 1).toLocaleString('es-GT', { month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
                <ScrollArea className="flex-1 p-2">
                  {loading ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
                  ) : filteredUnlinked.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">
                      {search ? "Sin resultados" : "No hay facturas sin póliza en este período"}
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {filteredUnlinked.map(p => (
                        <PurchaseRow
                          key={p.id}
                          purchase={p}
                          action={() => handleLink(p)}
                          actionIcon={<ArrowRight className="h-4 w-4 text-primary" />}
                          actionLabel="Vincular a esta póliza"
                        />
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="crear" className="flex-1 mt-0 min-h-0 overflow-y-auto data-[state=inactive]:hidden">
                <QuickPurchaseForm
                  enterpriseId={enterpriseId}
                  journalEntryId={journalEntryId}
                  entryDate={entryDate}
                  entryMonth={entryMonth || new Date().getMonth() + 1}
                  entryYear={entryYear || new Date().getFullYear()}
                  accounts={accounts}
                  felDocTypes={felDocTypes}
                  onCreated={handleInvoiceCreated}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right: Linked */}
          <div className="flex flex-col border rounded-lg overflow-hidden">
            <div className="p-3 border-b bg-primary/5">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Vinculadas ({linkedPurchases.length})
              </h4>
            </div>
            <ScrollArea className="flex-1 p-2">
              {linkedPurchases.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  Sin facturas vinculadas
                </p>
              ) : (
                <div className="space-y-1.5">
                  {linkedPurchases.map(p => (
                    <PurchaseRow
                      key={p.id}
                      purchase={p}
                      action={() => handleUnlink(p)}
                      actionIcon={<Unlink className="h-4 w-4 text-destructive" />}
                      actionLabel="Desvincular"
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

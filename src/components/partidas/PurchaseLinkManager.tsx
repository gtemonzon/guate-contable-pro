import { useState, useEffect, useCallback, useRef } from "react";
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
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Link2, Unlink, Search, FileText, ArrowRight, Plus, CheckSquare, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { QuickPurchaseForm } from "./QuickPurchaseForm";
import { PurchaseLinkSummary } from "./PurchaseLinkSummary";

interface BatchProgress {
  active: boolean;
  action: 'linking' | 'unlinking';
  current: number;
  total: number;
  currentInvoice?: string;
}

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
  onApplyToEntry?: () => Promise<void> | void;
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
  const [applying, setApplying] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: number; account_code: string; account_name: string }>>([]);
  const [felDocTypes, setFelDocTypes] = useState<Array<{ code: string; name: string; affects_total: number; applies_vat: boolean }>>([]);
  const [selectedUnlinked, setSelectedUnlinked] = useState<Set<number>>(new Set());
  const [selectedLinked, setSelectedLinked] = useState<Set<number>>(new Set());
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({ active: false, action: 'linking', current: 0, total: 0 });
  const initialLinkedRef = useRef<Set<number>>(new Set());
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

      // Store initial state for pending-changes tracking
      initialLinkedRef.current = new Set(allLinkedIds);

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
      setSelectedUnlinked(new Set());
      setSelectedLinked(new Set());
      setHasPendingChanges(false);
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
        supabase.from("tab_fel_document_types").select("code, name, affects_total, applies_vat").eq("is_active", true).order("name"),
      ]);
      setAccounts(accts || []);
      setFelDocTypes((docTypes as Array<{ code: string; name: string; affects_total: number; applies_vat: boolean }>) || []);
    } catch (err) {
      console.error("Error loading reference data:", err);
    }
  }, [open, enterpriseId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadReferenceData(); }, [loadReferenceData]);

  // Track pending changes by comparing current linked set to initial
  const updatePendingFlag = useCallback((newLinkedList: PurchaseRecord[]) => {
    const currentIds = new Set(newLinkedList.map(p => p.id));
    const initial = initialLinkedRef.current;
    const changed = currentIds.size !== initial.size || [...currentIds].some(id => !initial.has(id));
    setHasPendingChanges(changed);
  }, []);

  const autoApply = useCallback(async (linkedList?: PurchaseRecord[]) => {
    if (!onApplyToEntry || entryStatus === 'contabilizado') return;
    setApplying(true);
    try {
      await onApplyToEntry();
      const list = linkedList ?? linkedPurchases;
      setHasPendingChanges(false);
      initialLinkedRef.current = new Set(list.map(p => p.id));
      toast({
        title: "Póliza actualizada correctamente",
        description: `Líneas regeneradas con ${list.length} factura${list.length !== 1 ? 's' : ''}`,
      });
    } catch (err: unknown) {
      toast({ title: "Error al aplicar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }, [onApplyToEntry, entryStatus, linkedPurchases, toast]);

  /**
   * Batch link: insert all links, update UI state once, regenerate policy once.
   */
  const batchLink = useCallback(async (purchases: PurchaseRecord[]) => {
    if (purchases.length === 0) return;
    const isBatch = purchases.length > 1;
    if (isBatch) {
      setBatchProgress({ active: true, action: 'linking', current: 0, total: purchases.length });
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const errors: string[] = [];
      const successPurchases: PurchaseRecord[] = [];

      for (let i = 0; i < purchases.length; i++) {
        const p = purchases[i];
        if (isBatch) {
          setBatchProgress(prev => ({
            ...prev,
            current: i + 1,
            currentInvoice: `${p.supplier_name} - ${p.invoice_number}`,
          }));
        }
        try {
          const [{ error: linkError }, { error: legacyError }] = await Promise.all([
            supabase
              .from("tab_purchase_journal_links" as any)
              .upsert({
                enterprise_id: enterpriseId,
                purchase_id: p.id,
                journal_entry_id: journalEntryId,
                link_source: 'MANUAL_LINK',
                linked_by: user.id,
                linked_at: new Date().toISOString(),
              }, { onConflict: "enterprise_id,purchase_id" }),
            supabase
              .from("tab_purchase_ledger")
              .update({ journal_entry_id: journalEntryId })
              .eq("enterprise_id", enterpriseId)
              .eq("id", p.id)
              .is("deleted_at", null),
          ]);
          if (linkError) throw linkError;
          if (legacyError) throw legacyError;
          successPurchases.push(p);
        } catch (err: unknown) {
          errors.push(`${p.invoice_number}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (successPurchases.length > 0) {
        const successIds = new Set(successPurchases.map(p => p.id));
        setUnlinkedPurchases(prev => prev.filter(p => !successIds.has(p.id)));
        setLinkedPurchases(prev => {
          const next = [...prev, ...successPurchases];
          updatePendingFlag(next);
          return next;
        });
        setSelectedUnlinked(prev => {
          const n = new Set(prev);
          successIds.forEach(id => n.delete(id));
          return n;
        });

        const newLinked = [...linkedPurchases.filter(p => !successIds.has(p.id)), ...successPurchases];
        await autoApply(newLinked);
      }

      if (errors.length > 0) {
        toast({
          title: `${errors.length} factura(s) no se pudieron vincular`,
          description: errors.join('\n'),
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      toast({ title: "Error al vincular", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      if (isBatch) setBatchProgress({ active: false, action: 'linking', current: 0, total: 0 });
    }
  }, [enterpriseId, journalEntryId, linkedPurchases, updatePendingFlag, autoApply, toast]);

  /**
   * Batch unlink: delete all links, update UI state once, regenerate policy once.
   */
  const batchUnlink = useCallback(async (purchases: PurchaseRecord[]) => {
    if (purchases.length === 0) return;
    const isBatch = purchases.length > 1;
    if (isBatch) {
      setBatchProgress({ active: true, action: 'unlinking', current: 0, total: purchases.length });
    }
    try {
      const errors: string[] = [];
      const successPurchases: PurchaseRecord[] = [];

      for (let i = 0; i < purchases.length; i++) {
        const p = purchases[i];
        if (isBatch) {
          setBatchProgress(prev => ({
            ...prev,
            current: i + 1,
            currentInvoice: `${p.supplier_name} - ${p.invoice_number}`,
          }));
        }
        try {
          const [{ error: linkError }, { error: legacyError }] = await Promise.all([
            supabase
              .from("tab_purchase_journal_links" as any)
              .delete()
              .eq("enterprise_id", enterpriseId)
              .eq("purchase_id", p.id),
            supabase
              .from("tab_purchase_ledger")
              .update({ journal_entry_id: null })
              .eq("enterprise_id", enterpriseId)
              .eq("id", p.id)
              .eq("journal_entry_id", journalEntryId)
              .is("deleted_at", null),
          ]);
          if (linkError) throw linkError;
          if (legacyError) throw legacyError;
          successPurchases.push(p);
        } catch (err: unknown) {
          errors.push(`${p.invoice_number}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (successPurchases.length > 0) {
        const successIds = new Set(successPurchases.map(p => p.id));
        setLinkedPurchases(prev => {
          const next = prev.filter(p => !successIds.has(p.id));
          updatePendingFlag(next);
          return next;
        });
        setUnlinkedPurchases(prev =>
          [...prev, ...successPurchases].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))
        );
        setSelectedLinked(prev => {
          const n = new Set(prev);
          successIds.forEach(id => n.delete(id));
          return n;
        });

        const newLinked = linkedPurchases.filter(p => !successIds.has(p.id));
        await autoApply(newLinked);
      }

      if (errors.length > 0) {
        toast({
          title: `${errors.length} factura(s) no se pudieron desvincular`,
          description: errors.join('\n'),
          variant: "destructive",
        });
      }
    } catch (err: unknown) {
      toast({ title: "Error al desvincular", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      if (isBatch) setBatchProgress({ active: false, action: 'unlinking', current: 0, total: 0 });
    }
  }, [enterpriseId, linkedPurchases, updatePendingFlag, autoApply, toast]);

  const handleLink = (purchase: PurchaseRecord) => batchLink([purchase]);
  const handleUnlink = (purchase: PurchaseRecord) => batchUnlink([purchase]);

  const handleBulkLink = () => {
    const toLink = unlinkedPurchases.filter(p => selectedUnlinked.has(p.id));
    return batchLink(toLink);
  };

  const handleBulkUnlink = () => {
    const toUnlink = linkedPurchases.filter(p => selectedLinked.has(p.id));
    return batchUnlink(toUnlink);
  };
  const handleApplyToEntry = async () => {
    await autoApply();
  };

  const [autoApplyAfterLoad, setAutoApplyAfterLoad] = useState(false);

  // After loadData finishes and we have linked purchases, auto-apply if flagged
  useEffect(() => {
    if (autoApplyAfterLoad && !loading && linkedPurchases.length > 0) {
      setAutoApplyAfterLoad(false);
      autoApply(linkedPurchases);
    }
  }, [autoApplyAfterLoad, loading, linkedPurchases, autoApply]);

  const handleInvoiceCreated = () => {
    loadData();
    setAutoApplyAfterLoad(true);
  };

  const filteredUnlinked = search
    ? unlinkedPurchases.filter(p =>
        p.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
        p.supplier_nit.toLowerCase().includes(search.toLowerCase()) ||
        p.invoice_number.toLowerCase().includes(search.toLowerCase())
      )
    : unlinkedPurchases;

  const toggleSelect = (set: Set<number>, setFn: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) => {
    setFn(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allUnlinkedSelected = filteredUnlinked.length > 0 && filteredUnlinked.every(p => selectedUnlinked.has(p.id));
  const allLinkedSelected = linkedPurchases.length > 0 && linkedPurchases.every(p => selectedLinked.has(p.id));

  const toggleSelectAllUnlinked = () => {
    if (allUnlinkedSelected) {
      setSelectedUnlinked(new Set());
    } else {
      setSelectedUnlinked(new Set(filteredUnlinked.map(p => p.id)));
    }
  };

  const toggleSelectAllLinked = () => {
    if (allLinkedSelected) {
      setSelectedLinked(new Set());
    } else {
      setSelectedLinked(new Set(linkedPurchases.map(p => p.id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!batchProgress.active && !applying) onOpenChange(v); }} modal>
      <DialogContent
        className="max-w-4xl max-h-[85vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (batchProgress.active || applying) e.preventDefault(); e.stopPropagation(); }}
      >
        {/* Batch / applying processing overlay */}
        {(applying || batchProgress.active) && (
          <div className="absolute inset-0 z-[60] bg-background/70 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="flex flex-col items-center gap-3 max-w-xs w-full px-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-semibold text-foreground">
                {batchProgress.active
                  ? (batchProgress.action === 'linking' ? 'Vinculando facturas…' : 'Desvinculando facturas…')
                  : 'Actualizando póliza…'}
              </p>
              {batchProgress.active && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Procesando factura {batchProgress.current} de {batchProgress.total}
                  </p>
                  <Progress
                    value={batchProgress.total > 0 ? Math.round((batchProgress.current / batchProgress.total) * 100) : 0}
                    className="h-2 w-full"
                  />
                  {batchProgress.currentInvoice && (
                    <p className="text-xs text-muted-foreground truncate max-w-full">
                      {batchProgress.currentInvoice}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Facturas
          </DialogTitle>
        </DialogHeader>

        {/* Pending changes banner */}
        {hasPendingChanges && entryStatus !== 'contabilizado' && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300 shrink-0">
            <span>⚠ Cambios pendientes: aplique a póliza para actualizar las líneas contables.</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-amber-400 dark:border-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40"
              onClick={handleApplyToEntry}
              disabled={applying}
            >
              {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Aplicar a póliza
            </Button>
          </div>
        )}

        <PurchaseLinkSummary
          linkedPurchases={linkedPurchases}
          entryStatus={entryStatus}
          journalEntryNumber={journalEntryNumber}
          bankAccountId={bankAccountId}
          accounts={accounts}
          felDocTypes={felDocTypes}
          onApplyToEntry={handleApplyToEntry}
          applying={applying}
          hasPendingChanges={hasPendingChanges}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
          {/* ═══ Left: Available + Create ═══ */}
          <div className="flex flex-col border rounded-lg min-h-0">
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

                {/* Select all + Bulk action bar */}
                {filteredUnlinked.length > 0 && (
                  <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allUnlinkedSelected}
                        onCheckedChange={toggleSelectAllUnlinked}
                        className="shrink-0"
                      />
                      <span className="text-xs text-muted-foreground">
                        {selectedUnlinked.size > 0 ? `${selectedUnlinked.size} seleccionada(s)` : 'Seleccionar todo'}
                      </span>
                    </div>
                    {selectedUnlinked.size > 0 && (
                      <Button size="sm" variant="default" onClick={handleBulkLink} className="h-7 text-xs gap-1">
                        <CheckSquare className="h-3.5 w-3.5" />
                        Vincular seleccionadas
                      </Button>
                    )}
                  </div>
                )}

            <ScrollArea className="flex-1" style={{ scrollbarGutter: 'stable' }}>
                  <div className="p-2 space-y-1">
                    {loading ? (
                      <p className="text-center text-muted-foreground py-8 text-sm">Cargando...</p>
                    ) : filteredUnlinked.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8 text-sm">
                        {search ? "Sin resultados" : "No hay facturas sin póliza en este período"}
                      </p>
                    ) : (
                      filteredUnlinked.map(p => (
                        <div
                          key={p.id}
                          data-testid={`link-row-${p.id}`}
                          className="flex items-center justify-between gap-2 py-2 px-3 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <Checkbox
                            checked={selectedUnlinked.has(p.id)}
                            onCheckedChange={() => toggleSelect(selectedUnlinked, setSelectedUnlinked, p.id)}
                            className="shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.supplier_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.invoice_date} • {p.fel_document_type} {p.invoice_series ? `${p.invoice_series}-` : ''}{p.invoice_number} • <span className="font-mono">{formatCurrency(p.total_amount)}</span>
                            </p>
                          </div>
                          <div data-testid={`link-btn-${p.id}`} className="shrink-0" style={{ minWidth: '100px' }}>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => { e.stopPropagation(); handleLink(p); }}
                              className="w-full h-8 text-xs gap-1"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Vincular
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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

          {/* ═══ Right: Linked ═══ */}
          <div className="flex flex-col border rounded-lg min-h-0">
            <div className="p-3 border-b bg-primary/5">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Vinculadas ({linkedPurchases.length})
              </h4>
            </div>

            {/* Select all + Bulk unlink bar */}
            {linkedPurchases.length > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allLinkedSelected}
                    onCheckedChange={toggleSelectAllLinked}
                    className="shrink-0"
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedLinked.size > 0 ? `${selectedLinked.size} seleccionada(s)` : 'Seleccionar todo'}
                  </span>
                </div>
                {selectedLinked.size > 0 && (
                  <Button size="sm" variant="outline" onClick={handleBulkUnlink} className="h-7 text-xs gap-1 border-destructive/30 text-destructive hover:bg-destructive/10">
                    <CheckSquare className="h-3.5 w-3.5" />
                    Desvincular seleccionadas
                  </Button>
                )}
              </div>
            )}

            <ScrollArea className="flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="p-2 space-y-1">
                {linkedPurchases.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    Sin facturas vinculadas
                  </p>
                ) : (
                  linkedPurchases.map(p => (
                    <div
                      key={p.id}
                      data-testid={`unlink-row-${p.id}`}
                      className="flex items-center justify-between gap-2 py-2 px-3 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedLinked.has(p.id)}
                        onCheckedChange={() => toggleSelect(selectedLinked, setSelectedLinked, p.id)}
                        className="shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.supplier_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.invoice_date} • {p.fel_document_type} {p.invoice_series ? `${p.invoice_series}-` : ''}{p.invoice_number} • <span className="font-mono">{formatCurrency(p.total_amount)}</span>
                        </p>
                      </div>
                      <div data-testid={`unlink-btn-${p.id}`} className="shrink-0" style={{ minWidth: '110px' }}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); handleUnlink(p); }}
                          className="w-full h-8 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                        >
                          <Unlink className="h-3.5 w-3.5" />
                          Desvincular
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Always-visible footer with "Actualizar Póliza" for draft entries */}
        {entryStatus !== 'contabilizado' && onApplyToEntry && linkedPurchases.length > 0 && (
          <div className="flex items-center justify-end gap-2 pt-2 border-t shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant={hasPendingChanges ? "default" : "secondary"}
                      size="sm"
                      className="gap-1.5"
                      onClick={handleApplyToEntry}
                      disabled={applying || !hasPendingChanges}
                    >
                      {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                      Actualizar Póliza
                      {hasPendingChanges && (
                        <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0 h-4 border-primary/40">
                          Pendiente
                        </Badge>
                      )}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {hasPendingChanges
                    ? "Hay cambios pendientes — haga clic para regenerar las líneas contables"
                    : "No hay cambios pendientes"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

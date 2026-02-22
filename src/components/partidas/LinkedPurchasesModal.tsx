import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calculator, FileText } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { Account } from "@/components/ui/account-combobox";
import { Badge } from "@/components/ui/badge";
import { useEnterpriseConfig } from "@/hooks/useEnterpriseConfig";
import { validateNIT } from "@/utils/nitValidation";
import { PurchaseInvoiceList } from "@/components/compras/PurchaseInvoiceList";
import type { PurchaseEntry } from "@/components/compras/PurchaseCard";

interface DetailLine {
  id: string;
  account_id: number | null;
  description: string;
  bank_reference: string;
  cost_center: string;
  debit_amount: number;
  credit_amount: number;
  source_type?: string | null;
  source_id?: number | null;
  source_ref?: string | null;
}

interface LinkedPurchasesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryDate: string;
  documentReference: string;
  enterpriseId: number;
  bankAccountId?: number | null;
  journalEntryId?: number | null;
  onPurchasesPosted: (lines: DetailLine[]) => void;
}

interface FelDocumentType {
  code: string;
  name: string;
}

interface OperationType {
  id: number;
  code: string;
  name: string;
}

const VAT_RATE = 0.12;

export default function LinkedPurchasesModal({
  open,
  onOpenChange,
  entryDate,
  documentReference,
  enterpriseId,
  bankAccountId,
  journalEntryId,
  onPurchasesPosted,
}: LinkedPurchasesModalProps) {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [existingPurchaseIds, setExistingPurchaseIds] = useState<number[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [felDocTypes, setFelDocTypes] = useState<FelDocumentType[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [focusLastCard, setFocusLastCard] = useState(false);
  const [duplicateWarnings, setDuplicateWarnings] = useState<Record<number, string | null>>({});

  const { toast } = useToast();
  const { config } = useEnterpriseConfig(enterpriseId);

  const entryMonth = entryDate ? new Date(entryDate + 'T00:00:00').getMonth() + 1 : new Date().getMonth() + 1;
  const entryYear = entryDate ? new Date(entryDate + 'T00:00:00').getFullYear() : new Date().getFullYear();
  const monthName = new Date(entryYear, entryMonth - 1).toLocaleString('es-GT', { month: 'long', year: 'numeric' });

  useEffect(() => {
    if (open && enterpriseId) {
      loadAccounts();
      loadFelDocTypes();
      loadOperationTypes();
      if (journalEntryId) {
        loadExistingPurchases(journalEntryId);
      } else if (purchases.length === 0) {
        addPurchase();
      }
    }
  }, [open, enterpriseId]);

  useEffect(() => {
    if (!open) {
      setPurchases([]);
      setExistingPurchaseIds([]);
      setEditingIndex(null);
      setDuplicateWarnings({});
    }
  }, [open]);

  // Ctrl+Alt+"+" shortcut
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && (e.key === '+' || e.key === 'Add')) {
        e.preventDefault();
        addPurchase();
        toast({ title: "Nueva factura agregada", description: "Se agregó una nueva fila" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, purchases]);

  const loadAccounts = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_accounts")
        .select("id, account_code, account_name")
        .eq("enterprise_id", enterpriseId)
        .eq("allows_movement", true)
        .eq("is_active", true)
        .order("account_code");
      if (error) throw error;
      setAccounts(data || []);
    } catch (error: any) {
      console.error("Error loading accounts:", error);
    }
  };

  const loadFelDocTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_fel_document_types")
        .select("code, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      setFelDocTypes(data || []);
    } catch (error: any) {
      console.error("Error loading FEL doc types:", error);
    }
  };

  const loadOperationTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("tab_operation_types")
        .select("id, code, name")
        .in("applies_to", ["purchases", "both"])
        .eq("is_active", true)
        .or(`enterprise_id.eq.${enterpriseId},is_system.eq.true`)
        .order("name");
      if (error) throw error;
      setOperationTypes(data || []);
    } catch (error: any) {
      console.error("Error loading operation types:", error);
    }
  };

  const loadExistingPurchases = async (entryId: number) => {
    try {
      let data: any[] | null = null;
      
      // Try by journal_entry_id first
      const { data: d1, error: e1 } = await supabase
        .from("tab_purchase_ledger")
        .select("*")
        .eq("enterprise_id", enterpriseId)
        .eq("journal_entry_id", entryId)
        .order("created_at");
      if (e1) throw e1;
      data = d1;

      // Fallback to batch_reference
      if ((!data || data.length === 0) && documentReference) {
        const { data: d2 } = await supabase
          .from("tab_purchase_ledger")
          .select("*")
          .eq("enterprise_id", enterpriseId)
          .eq("batch_reference", documentReference)
          .order("created_at");
        data = d2;
      }

      if (data && data.length > 0) {
        setExistingPurchaseIds(data.map(d => d.id));
        const loaded: PurchaseEntry[] = data.map(d => ({
          id: d.id,
          invoice_series: d.invoice_series || "",
          invoice_number: d.invoice_number,
          invoice_date: d.invoice_date,
          fel_document_type: d.fel_document_type || "FACT",
          supplier_nit: d.supplier_nit,
          supplier_name: d.supplier_name,
          total_amount: d.total_amount,
          base_amount: d.base_amount || Number((d.total_amount / (1 + VAT_RATE)).toFixed(2)),
          vat_amount: d.vat_amount,
          idp_amount: d.idp_amount || 0,
          batch_reference: d.batch_reference || "",
          operation_type_id: d.operation_type_id,
          expense_account_id: d.expense_account_id,
          bank_account_id: d.bank_account_id,
          journal_entry_id: d.journal_entry_id,
        }));
        setPurchases(loaded);
      } else {
        addPurchase();
      }
    } catch (error: any) {
      console.error("Error loading existing purchases:", error);
      addPurchase();
    }
  };

  const createEmptyPurchase = (): PurchaseEntry => ({
    invoice_series: "",
    invoice_number: "",
    invoice_date: entryDate || new Date().toISOString().split('T')[0],
    fel_document_type: "FACT",
    supplier_nit: "",
    supplier_name: "",
    total_amount: 0,
    base_amount: 0,
    vat_amount: 0,
    idp_amount: 0,
    batch_reference: "",
    operation_type_id: null,
    expense_account_id: null,
    bank_account_id: null,
    journal_entry_id: null,
    isNew: true,
  });

  const addPurchase = () => {
    setPurchases(prev => [...prev, createEmptyPurchase()]);
    setEditingIndex(purchases.length); // auto-edit the new one
    setFocusLastCard(true);
  };

  const removePurchase = (index: number) => {
    if (purchases.length <= 1) {
      toast({ title: "Mínimo requerido", description: "Debe haber al menos una factura", variant: "destructive" });
      return;
    }
    setPurchases(prev => prev.filter((_, i) => i !== index));
    setDuplicateWarnings(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
    if (editingIndex === index) setEditingIndex(null);
  };

  const updatePurchase = (index: number, field: keyof PurchaseEntry, value: any) => {
    setPurchases(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const updated = { ...p, [field]: value };
      if (field === 'total_amount') {
        const total = Number(value) || 0;
        updated.base_amount = Number((total / (1 + VAT_RATE)).toFixed(2));
        updated.vat_amount = Number((total - updated.base_amount).toFixed(2));
      }
      return updated;
    }));
  };

  // Save is a no-op in embedded mode (data stays local until contabilizar)
  const handleSave = (_index: number) => {
    // In embedded mode we don't auto-save to DB.
    // Just clear the editing state.
  };

  const checkDuplicate = async (index: number) => {
    const purchase = purchases[index];
    if (!purchase.invoice_number.trim() || !purchase.supplier_nit.trim()) {
      setDuplicateWarnings(prev => ({ ...prev, [index]: null }));
      return;
    }
    try {
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("id, invoice_date")
        .eq("enterprise_id", enterpriseId)
        .eq("supplier_nit", purchase.supplier_nit)
        .eq("fel_document_type", purchase.fel_document_type)
        .eq("invoice_series", purchase.invoice_series || "")
        .eq("invoice_number", purchase.invoice_number);

      if (error) throw error;

      if (data && data.length > 0) {
        const d = new Date(data[0].invoice_date);
        const mName = d.toLocaleString('es-GT', { month: 'long' });
        setDuplicateWarnings(prev => ({ ...prev, [index]: `Factura duplicada (${mName} ${d.getFullYear()})` }));
        return;
      }

      // Check in-modal duplicates
      const siblings = purchases.filter((p, i) =>
        i !== index &&
        p.supplier_nit === purchase.supplier_nit &&
        p.fel_document_type === purchase.fel_document_type &&
        (p.invoice_series || "") === (purchase.invoice_series || "") &&
        p.invoice_number === purchase.invoice_number
      );
      if (siblings.length > 0) {
        setDuplicateWarnings(prev => ({ ...prev, [index]: "Factura duplicada en este lote" }));
        return;
      }

      setDuplicateWarnings(prev => ({ ...prev, [index]: null }));
    } catch (error) {
      console.error("Error checking duplicate:", error);
    }
  };

  const getTotals = useCallback(() => {
    return purchases.reduce((acc, p) => ({
      total: acc.total + (p.total_amount || 0),
      base: acc.base + (p.base_amount || 0),
      vat: acc.vat + (p.vat_amount || 0),
    }), { total: 0, base: 0, vat: 0 });
  }, [purchases]);

  const validatePurchases = (): boolean => {
    if (purchases.length === 0) {
      toast({ title: "Sin facturas", description: "Debe agregar al menos una factura", variant: "destructive" });
      return false;
    }
    for (const [i, p] of purchases.entries()) {
      if (!p.supplier_nit.trim()) {
        toast({ title: "NIT requerido", description: "Todas las facturas deben tener NIT del proveedor", variant: "destructive" });
        return false;
      }
      if (p.supplier_nit.toUpperCase() !== "CF" && !validateNIT(p.supplier_nit)) {
        toast({ title: "NIT inválido", description: "Corrija los NIT marcados como inválidos", variant: "destructive" });
        return false;
      }
      if (!p.supplier_name.trim()) {
        toast({ title: "Proveedor requerido", description: "Todas las facturas deben tener nombre del proveedor", variant: "destructive" });
        return false;
      }
      if (!p.invoice_number.trim()) {
        toast({ title: "Número de factura requerido", description: "Todas las facturas deben tener número", variant: "destructive" });
        return false;
      }
      if (p.total_amount <= 0) {
        toast({ title: "Monto inválido", description: "El total de cada factura debe ser mayor a cero", variant: "destructive" });
        return false;
      }
      if (!p.expense_account_id) {
        toast({ title: "Cuenta de gasto requerida", description: "Todas las facturas deben tener cuenta de gasto asignada", variant: "destructive" });
        return false;
      }
      if (duplicateWarnings[i]) {
        toast({ title: "Factura duplicada", description: "Hay facturas duplicadas, revise antes de contabilizar", variant: "destructive" });
        return false;
      }
    }
    if (!config?.vat_credit_account_id) {
      toast({ title: "Configuración incompleta", description: "Debe configurar la cuenta de IVA Crédito Fiscal en Configuración de Empresa", variant: "destructive" });
      return false;
    }
    if (!bankAccountId && !config?.suppliers_account_id) {
      toast({ title: "Configuración incompleta", description: "Debe configurar la cuenta de Proveedores en Configuración de Empresa", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleContabilizar = async () => {
    if (!validatePurchases()) return;
    setLoading(true);
    try {
      const totals = getTotals();
      const generatedLines: DetailLine[] = [];

      const purchaseRefs = purchases.map(p =>
        `${p.fel_document_type} ${p.invoice_series ? p.invoice_series + '-' : ''}${p.invoice_number}`
      );

      const expensesByAccount: Record<number, { total: number; descriptions: string[]; refs: string[] }> = {};
      for (let i = 0; i < purchases.length; i++) {
        const p = purchases[i];
        if (!p.expense_account_id) continue;
        if (!expensesByAccount[p.expense_account_id]) {
          expensesByAccount[p.expense_account_id] = { total: 0, descriptions: [], refs: [] };
        }
        expensesByAccount[p.expense_account_id].total += p.base_amount;
        expensesByAccount[p.expense_account_id].descriptions.push(
          `${p.supplier_name} - Fact. ${p.invoice_series ? p.invoice_series + '-' : ''}${p.invoice_number}`
        );
        expensesByAccount[p.expense_account_id].refs.push(purchaseRefs[i]);
      }

      for (const [accountId, data] of Object.entries(expensesByAccount)) {
        generatedLines.push({
          id: crypto.randomUUID(),
          account_id: Number(accountId),
          description: data.descriptions.join('; '),
          bank_reference: documentReference,
          cost_center: "",
          debit_amount: Number(data.total.toFixed(2)),
          credit_amount: 0,
          source_type: 'PURCHASE',
          source_ref: data.refs.join(', '),
        });
      }

      if (totals.vat > 0 && config?.vat_credit_account_id) {
        generatedLines.push({
          id: crypto.randomUUID(),
          account_id: config.vat_credit_account_id,
          description: `IVA Crédito Fiscal - ${purchases.length} factura(s)`,
          bank_reference: documentReference,
          cost_center: "",
          debit_amount: Number(totals.vat.toFixed(2)),
          credit_amount: 0,
          source_type: 'PURCHASE',
          source_ref: purchaseRefs.join(', '),
        });
      }

      if (!bankAccountId && config?.suppliers_account_id) {
        generatedLines.push({
          id: crypto.randomUUID(),
          account_id: config.suppliers_account_id,
          description: `Proveedores - ${purchases.length} factura(s) - Ref: ${documentReference || 'S/N'}`,
          bank_reference: documentReference,
          cost_center: "",
          debit_amount: 0,
          credit_amount: Number(totals.total.toFixed(2)),
          source_type: 'PURCHASE',
          source_ref: purchaseRefs.join(', '),
        });
      }

      // Delete old purchase records if editing
      if (existingPurchaseIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("tab_purchase_ledger")
          .delete()
          .in("id", existingPurchaseIds);
        if (deleteError) {
          console.error("Error deleting old purchases:", deleteError);
        }
      }

      // Save purchases to purchase ledger
      const purchasesToInsert = purchases.map(p => ({
        enterprise_id: enterpriseId,
        invoice_series: p.invoice_series || null,
        invoice_number: p.invoice_number,
        invoice_date: p.invoice_date,
        fel_document_type: p.fel_document_type,
        supplier_nit: p.supplier_nit,
        supplier_name: p.supplier_name,
        total_amount: p.total_amount,
        net_amount: p.base_amount,
        base_amount: p.base_amount,
        vat_amount: p.vat_amount,
        operation_type_id: p.operation_type_id || null,
        expense_account_id: p.expense_account_id || null,
        bank_account_id: bankAccountId || null,
        batch_reference: documentReference || null,
        journal_entry_id: journalEntryId || null,
      }));

      const { error: purchaseError } = await supabase
        .from("tab_purchase_ledger")
        .insert(purchasesToInsert);

      if (purchaseError) {
        console.error("Error saving purchases:", purchaseError);
        toast({ title: "Advertencia", description: "Las líneas contables se generaron pero hubo un error al guardar en el libro de compras: " + purchaseError.message, variant: "destructive" });
      }

      onPurchasesPosted(generatedLines);
      const balanceNote = bankAccountId ? "" : " Seleccione una cuenta bancaria para balancear la partida.";
      toast({ title: "Facturas importadas", description: `Se generaron ${generatedLines.length} líneas de detalle y ${purchases.length} registro(s) en libro de compras.${balanceNote}` });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error al contabilizar", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const totals = getTotals();
  const creditPreviewLabel = bankAccountId ? "Banco" : "Proveedores";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Agregar Facturas de Compra
          </DialogTitle>
        </DialogHeader>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="text-sm">
              Período: {monthName}
            </Badge>
            <Badge variant="outline" className="text-sm font-mono">
              Ref. Pago: {documentReference || 'Sin referencia'}
            </Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <p className="text-muted-foreground">Total: <span className="font-semibold text-foreground">{formatCurrency(totals.total)}</span></p>
              <p className="text-xs text-muted-foreground">Base: {formatCurrency(totals.base)} | IVA: {formatCurrency(totals.vat)}</p>
            </div>
            <Button onClick={handleContabilizar} disabled={loading || purchases.length === 0} className="gap-2">
              <Calculator className="h-4 w-4" />
              Contabilizar
            </Button>
          </div>
        </div>

        {/* Invoices list using shared component */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="pb-4">
            <PurchaseInvoiceList
              purchases={purchases}
              variant="compact"
              felDocTypes={felDocTypes}
              operationTypes={operationTypes}
              expenseAccounts={accounts}
              bankAccounts={[]}
              editingIndex={editingIndex}
              onEditingIndexChange={setEditingIndex}
              onUpdate={updatePurchase}
              onSave={handleSave}
              onDelete={removePurchase}
              onAdd={addPurchase}
              addButtonLabel="Agregar Factura"
              addShortcutHint="Ctrl+Alt++"
              duplicateWarnings={duplicateWarnings}
              onCheckDuplicate={checkDuplicate}
              focusLastCard={focusLastCard}
              onFocusLastCardDone={() => setFocusLastCard(false)}
            />

            {/* Preview */}
            {purchases.length > 0 && purchases.some(p => p.expense_account_id && p.total_amount > 0) && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 mt-4">
                <h5 className="font-medium text-sm">Vista previa de contabilización:</h5>
                <div className="text-xs space-y-1">
                  <p className="text-muted-foreground">
                    <span className="font-medium">DEBE:</span> Gastos ({formatCurrency(totals.base)}) + IVA Crédito ({formatCurrency(totals.vat)})
                  </p>
                  <p className="text-muted-foreground">
                    <span className="font-medium">HABER:</span> {creditPreviewLabel} ({formatCurrency(totals.total)})
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

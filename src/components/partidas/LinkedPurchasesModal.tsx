import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Calculator, FileText, AlertTriangle } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { AccountCombobox, Account } from "@/components/ui/account-combobox";
import { Badge } from "@/components/ui/badge";
import { useEnterpriseConfig } from "@/hooks/useEnterpriseConfig";
import { validateNIT } from "@/utils/nitValidation";

interface DetailLine {
  id: string;
  account_id: number | null;
  description: string;
  bank_reference: string;
  cost_center: string;
  debit_amount: number;
  credit_amount: number;
}

interface LinkedPurchaseEntry {
  id: string;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  operation_type_id: number | null;
  expense_account_id: number | null;
  nitError: string | null;
  duplicateWarning: string | null;
}

interface OperationType {
  id: number;
  code: string;
  name: string;
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
  const [purchases, setPurchases] = useState<LinkedPurchaseEntry[]>([]);
  const [existingPurchaseIds, setExistingPurchaseIds] = useState<number[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [felDocTypes, setFelDocTypes] = useState<FelDocumentType[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);

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
    }
  }, [open]);

  // Ctrl+Alt+"+" para agregar nueva factura
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
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("*")
        .eq("enterprise_id", enterpriseId)
        .eq("journal_entry_id", entryId)
        .order("created_at");

      if (error) throw error;

      if (data && data.length > 0) {
        setExistingPurchaseIds(data.map(d => d.id));
        const loaded: LinkedPurchaseEntry[] = data.map(d => ({
          id: crypto.randomUUID(),
          invoice_series: d.invoice_series || "",
          invoice_number: d.invoice_number,
          invoice_date: d.invoice_date,
          fel_document_type: d.fel_document_type || "FACT",
          supplier_nit: d.supplier_nit,
          supplier_name: d.supplier_name,
          total_amount: d.total_amount,
          base_amount: d.base_amount || Number((d.total_amount / (1 + VAT_RATE)).toFixed(2)),
          vat_amount: d.vat_amount,
          operation_type_id: d.operation_type_id,
          expense_account_id: d.expense_account_id,
          nitError: null,
          duplicateWarning: null,
        }));
        setPurchases(loaded);
      } else {
        // No existing purchases linked, also check by batch_reference
        if (documentReference) {
          const { data: batchData } = await supabase
            .from("tab_purchase_ledger")
            .select("*")
            .eq("enterprise_id", enterpriseId)
            .eq("batch_reference", documentReference)
            .order("created_at");

          if (batchData && batchData.length > 0) {
            setExistingPurchaseIds(batchData.map(d => d.id));
            const loaded: LinkedPurchaseEntry[] = batchData.map(d => ({
              id: crypto.randomUUID(),
              invoice_series: d.invoice_series || "",
              invoice_number: d.invoice_number,
              invoice_date: d.invoice_date,
              fel_document_type: d.fel_document_type || "FACT",
              supplier_nit: d.supplier_nit,
              supplier_name: d.supplier_name,
              total_amount: d.total_amount,
              base_amount: d.base_amount || Number((d.total_amount / (1 + VAT_RATE)).toFixed(2)),
              vat_amount: d.vat_amount,
              operation_type_id: d.operation_type_id,
              expense_account_id: d.expense_account_id,
              nitError: null,
              duplicateWarning: null,
            }));
            setPurchases(loaded);
          } else {
            addPurchase();
          }
        } else {
          addPurchase();
        }
      }
    } catch (error: any) {
      console.error("Error loading existing purchases:", error);
      addPurchase();
    }
  };

  const createEmptyPurchase = (): LinkedPurchaseEntry => ({
    id: crypto.randomUUID(),
    invoice_series: "",
    invoice_number: "",
    invoice_date: entryDate || new Date().toISOString().split('T')[0],
    fel_document_type: "FACT",
    supplier_nit: "",
    supplier_name: "",
    total_amount: 0,
    base_amount: 0,
    vat_amount: 0,
    operation_type_id: null,
    expense_account_id: null,
    nitError: null,
    duplicateWarning: null,
  });

  const addPurchase = () => {
    setPurchases(prev => [...prev, createEmptyPurchase()]);
  };

  const removePurchase = (id: string) => {
    if (purchases.length <= 1) {
      toast({ title: "Mínimo requerido", description: "Debe haber al menos una factura", variant: "destructive" });
      return;
    }
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  const updatePurchase = (id: string, field: keyof LinkedPurchaseEntry, value: any) => {
    setPurchases(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: value };
      if (field === 'total_amount') {
        const total = Number(value) || 0;
        updated.base_amount = Number((total / (1 + VAT_RATE)).toFixed(2));
        updated.vat_amount = Number((total - updated.base_amount).toFixed(2));
      }
      return updated;
    }));
  };

  // NIT validation on blur
  const handleNitBlur = async (purchase: LinkedPurchaseEntry) => {
    const nit = purchase.supplier_nit.trim();
    if (!nit) {
      updatePurchase(purchase.id, 'nitError', null);
      return;
    }
    if (!validateNIT(nit)) {
      updatePurchase(purchase.id, 'nitError', "NIT inválido");
      return;
    }
    updatePurchase(purchase.id, 'nitError', null);
    await searchSupplierByNit(purchase.id, nit);
  };

  const searchSupplierByNit = async (purchaseId: string, nit: string) => {
    if (!nit || nit.length < 4) return;
    try {
      const { data } = await supabase
        .from("tab_purchase_ledger")
        .select("supplier_name")
        .eq("supplier_nit", nit)
        .order("invoice_date", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        setPurchases(prev => prev.map(p => {
          if (p.id !== purchaseId) return p;
          if (p.supplier_name.trim()) return p;
          return { ...p, supplier_name: data[0].supplier_name };
        }));
      }
    } catch (error) {
      console.error("Error searching supplier:", error);
    }
  };

  // Duplicate check on invoice number blur
  const checkDuplicate = async (purchase: LinkedPurchaseEntry) => {
    if (!purchase.invoice_number.trim() || !purchase.supplier_nit.trim()) {
      updatePurchase(purchase.id, 'duplicateWarning', null);
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
        updatePurchase(purchase.id, 'duplicateWarning', `Factura duplicada (${mName} ${d.getFullYear()})`);
        return;
      }

      // Check in-modal duplicates
      const siblings = purchases.filter(p =>
        p.id !== purchase.id &&
        p.supplier_nit === purchase.supplier_nit &&
        p.fel_document_type === purchase.fel_document_type &&
        (p.invoice_series || "") === (purchase.invoice_series || "") &&
        p.invoice_number === purchase.invoice_number
      );
      if (siblings.length > 0) {
        updatePurchase(purchase.id, 'duplicateWarning', "Factura duplicada en este lote");
        return;
      }

      updatePurchase(purchase.id, 'duplicateWarning', null);
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
    for (const p of purchases) {
      if (!p.supplier_nit.trim()) {
        toast({ title: "NIT requerido", description: "Todas las facturas deben tener NIT del proveedor", variant: "destructive" });
        return false;
      }
      if (p.nitError) {
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
      if (p.duplicateWarning) {
        toast({ title: "Factura duplicada", description: "Hay facturas duplicadas, revise antes de contabilizar", variant: "destructive" });
        return false;
      }
    }
    if (!config?.vat_credit_account_id) {
      toast({ title: "Configuración incompleta", description: "Debe configurar la cuenta de IVA Crédito Fiscal en Configuración de Empresa", variant: "destructive" });
      return false;
    }
    // If no bank account, require suppliers account
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

      const expensesByAccount: Record<number, { total: number; descriptions: string[] }> = {};
      for (const p of purchases) {
        if (!p.expense_account_id) continue;
        if (!expensesByAccount[p.expense_account_id]) {
          expensesByAccount[p.expense_account_id] = { total: 0, descriptions: [] };
        }
        expensesByAccount[p.expense_account_id].total += p.base_amount;
        expensesByAccount[p.expense_account_id].descriptions.push(
          `${p.supplier_name} - Fact. ${p.invoice_series ? p.invoice_series + '-' : ''}${p.invoice_number}`
        );
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
        });
      }

      // Credit line: use bank account if selected, otherwise use suppliers account
      const creditAccountId = bankAccountId || config?.suppliers_account_id;
      const creditLabel = bankAccountId
        ? `Banco - ${purchases.length} factura(s) - Ref: ${documentReference || 'S/N'}`
        : `Proveedores - ${purchases.length} factura(s) - Ref: ${documentReference || 'S/N'}`;

      if (creditAccountId) {
        generatedLines.push({
          id: crypto.randomUUID(),
          account_id: creditAccountId,
          description: creditLabel,
          bank_reference: documentReference,
          cost_center: "",
          debit_amount: 0,
          credit_amount: Number(totals.total.toFixed(2)),
        });
      }

      // If editing, delete old purchase records first
      if (existingPurchaseIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("tab_purchase_ledger")
          .delete()
          .in("id", existingPurchaseIds);
        if (deleteError) {
          console.error("Error deleting old purchases:", deleteError);
        }
      }

      // Save purchases to purchase ledger (tab_purchase_ledger)
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
      toast({ title: "Facturas contabilizadas", description: `Se generaron ${generatedLines.length} líneas de detalle y ${purchases.length} registro(s) en libro de compras` });
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error al contabilizar", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const totals = getTotals();

  // Determine credit account label for preview
  const creditPreviewLabel = bankAccountId ? "Banco" : "Proveedores";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
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

        {/* Invoices list */}
        <ScrollArea className="flex-1">
          <div className="space-y-3 pb-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium text-sm">Facturas ({purchases.length})</h4>
              <Button onClick={addPurchase} variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Agregar Factura
              </Button>
            </div>

            {purchases.map((purchase, idx) => (
              <div key={purchase.id} className={cn(
                "border rounded-lg p-3 space-y-2",
                purchase.duplicateWarning && "border-destructive/50 bg-destructive/5",
                purchase.nitError && !purchase.duplicateWarning && "border-destructive/30"
              )}>
                {/* Row 1: Tipo, Serie, Número, Fecha, NIT, Proveedor */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Tipo Doc.</label>
                    <Select
                      value={purchase.fel_document_type}
                      onValueChange={(v) => updatePurchase(purchase.id, 'fel_document_type', v)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {felDocTypes.map((t) => (
                          <SelectItem key={t.code} value={t.code}>{t.code}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs text-muted-foreground">Serie</label>
                    <Input
                      value={purchase.invoice_series}
                      onChange={(e) => updatePurchase(purchase.id, 'invoice_series', e.target.value)}
                      placeholder="A"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Número</label>
                    <Input
                      value={purchase.invoice_number}
                      onChange={(e) => updatePurchase(purchase.id, 'invoice_number', e.target.value)}
                      onBlur={() => checkDuplicate(purchase)}
                      placeholder="123456"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Fecha</label>
                    <Input
                      type="date"
                      value={purchase.invoice_date}
                      onChange={(e) => updatePurchase(purchase.id, 'invoice_date', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">NIT</label>
                    <Input
                      value={purchase.supplier_nit}
                      onChange={(e) => {
                        const val = e.target.value.replace(/-/g, "");
                        updatePurchase(purchase.id, 'supplier_nit', val);
                        if (purchase.nitError && validateNIT(val)) {
                          updatePurchase(purchase.id, 'nitError', null);
                        }
                      }}
                      onBlur={() => handleNitBlur(purchase)}
                      placeholder="12345678"
                      className={cn("h-8 text-xs", purchase.nitError && "border-destructive")}
                    />
                    {purchase.nitError && <p className="text-[10px] text-destructive mt-0.5">{purchase.nitError}</p>}
                  </div>
                  <div className="col-span-3">
                    <label className="text-xs text-muted-foreground">Proveedor</label>
                    <Input
                      value={purchase.supplier_name}
                      onChange={(e) => updatePurchase(purchase.id, 'supplier_name', e.target.value)}
                      placeholder="Nombre proveedor"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Row 2: Total, IVA, Tipo Operación, Cuenta Gasto, Warnings, Delete */}
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Total c/IVA</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchase.total_amount || ""}
                      onChange={(e) => updatePurchase(purchase.id, 'total_amount', parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">IVA</label>
                    <Input
                      value={purchase.vat_amount ? formatCurrency(purchase.vat_amount) : "Q 0.00"}
                      readOnly
                      className="h-8 text-xs bg-muted"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground">Tipo Operación</label>
                    <Select
                      value={purchase.operation_type_id?.toString() || ""}
                      onValueChange={(v) => updatePurchase(purchase.id, 'operation_type_id', v ? parseInt(v) : null)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Tipo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {operationTypes.map((t) => (
                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    <label className="text-xs text-muted-foreground">Cuenta Gasto</label>
                    <AccountCombobox
                      accounts={accounts}
                      value={purchase.expense_account_id}
                      onValueChange={(v) => updatePurchase(purchase.id, 'expense_account_id', v)}
                      placeholder="Seleccionar cuenta..."
                      className="w-full"
                    />
                  </div>
                  <div className="col-span-2 flex items-end gap-1">
                    {purchase.duplicateWarning && (
                      <div className="flex items-center gap-1 text-destructive text-[10px] pb-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>{purchase.duplicateWarning}</span>
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 flex items-end justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removePurchase(purchase.id)}
                      disabled={purchases.length <= 1}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {/* Preview */}
            {purchases.length > 0 && purchases.some(p => p.expense_account_id && p.total_amount > 0) && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

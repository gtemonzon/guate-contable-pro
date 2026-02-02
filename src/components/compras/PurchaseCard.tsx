import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";

interface PurchaseEntry {
  id?: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  base_amount: number;
  vat_amount: number;
  batch_reference: string;
  operation_type_id: number | null;
  expense_account_id: number | null;
  bank_account_id: number | null;
  journal_entry_id: number | null;
  isNew?: boolean;
}

interface PurchaseCardProps {
  purchase: PurchaseEntry;
  index: number;
  felDocTypes: { code: string; name: string }[];
  operationTypes: { id: number; code: string; name: string }[];
  expenseAccounts: { id: number; account_code: string; account_name: string }[];
  bankAccounts: { id: number; account_code: string; account_name: string }[];
  onUpdate: (index: number, field: keyof PurchaseEntry, value: any) => void;
  onSave: (index: number) => void;
  onDelete: (index: number) => void;
  isHighlighted?: boolean;
  isEditing?: boolean;
  onStartEdit?: (index: number) => void;
  onCancelEdit?: () => void;
}

export interface PurchaseCardRef {
  focusDateField: () => void;
}

export const PurchaseCard = forwardRef<PurchaseCardRef, PurchaseCardProps>(({ 
  purchase, 
  index, 
  felDocTypes, 
  operationTypes, 
  expenseAccounts, 
  bankAccounts, 
  onUpdate, 
  onSave, 
  onDelete, 
  isHighlighted,
  isEditing = false,
  onStartEdit,
  onCancelEdit
}, ref) => {
  const [hasChanges, setHasChanges] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNewRecord = purchase.isNew;

  // Auto-enter edit mode for new records
  const inEditMode = isEditing || isNewRecord;

  useImperativeHandle(ref, () => ({
    focusDateField: () => {
      if (cardRef.current) {
        cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Use a slightly longer timeout to ensure the card is rendered and scrolled
      setTimeout(() => {
        if (dateInputRef.current) {
          dateInputRef.current.focus();
        }
      }, 150);
    }
  }));

  const searchSupplierByNit = async (nit: string) => {
    if (!nit || nit.length < 3) return;
    
    try {
      const { data, error } = await supabase
        .from("tab_purchase_ledger")
        .select("supplier_name, supplier_nit")
        .eq("supplier_nit", nit)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        onUpdate(index, "supplier_name", data.supplier_name);
      }
    } catch (error) {
      console.error("Error searching supplier:", error);
    }
  };

  const handleFieldChange = (field: keyof PurchaseEntry, value: any) => {
    setHasChanges(true);
    onUpdate(index, field, value);
  };

  const restoreFocusById = (activeId?: string | null) => {
    if (!activeId) return;
    window.setTimeout(() => {
      const el = document.getElementById(activeId) as HTMLElement | null;
      if (el && document.contains(el)) el.focus();
    }, 80);
  };

  // Auto-save with debounce when there are changes
  useEffect(() => {
    if (hasChanges && inEditMode) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        // Capture focus BEFORE any state changes
        const activeEl = document.activeElement as HTMLElement | null;
        const activeId = cardRef.current?.contains(activeEl) ? activeEl?.id : null;
        
        // Perform save
        onSave(index);
        setHasChanges(false);
        
        // Restore focus after a small delay to allow React to settle
        if (activeId) {
          window.requestAnimationFrame(() => {
            window.setTimeout(() => {
              const el = document.getElementById(activeId);
              if (el && document.contains(el)) {
                el.focus();
              }
            }, 50);
          });
        }
      }, 2000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasChanges, inEditMode]);

  // Save on unmount if there are pending changes
  useEffect(() => {
    return () => {
      if (hasChanges) {
        onSave(index);
      }
    };
  }, []);

  // Scroll into view when highlighted
  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  // Focus date field when entering edit mode for new records
  useEffect(() => {
    if (isNewRecord && dateInputRef.current) {
      setTimeout(() => {
        dateInputRef.current?.focus();
      }, 100);
    }
  }, [isNewRecord]);

  const handleSaveClick = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    onSave(index);
    setHasChanges(false);
    onCancelEdit?.();
  };

  const handleCancelClick = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    setHasChanges(false);
    onCancelEdit?.();
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    return date.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });
  };

  const getOperationTypeName = (id: number | null) => {
    if (!id) return "-";
    return operationTypes.find(t => t.id === id)?.code || "-";
  };

  const getAccountName = (id: number | null, accounts: { id: number; account_code: string; account_name: string }[]) => {
    if (!id) return "-";
    const acc = accounts.find(a => a.id === id);
    return acc ? `${acc.account_code}` : "-";
  };

  // READ-ONLY MODE: Show plain text
  if (!inEditMode) {
    return (
      <Card 
        ref={cardRef}
        className={cn(
          "hover:bg-muted/50 cursor-pointer transition-colors group",
          isHighlighted && "ring-2 ring-primary border-primary bg-accent/20"
        )}
        onClick={() => onStartEdit?.(index)}
      >
        <CardContent className="p-3">
          <div className="grid grid-cols-12 gap-2 items-center text-sm">
            <div className="col-span-1 text-muted-foreground">
              {formatDate(purchase.invoice_date)}
            </div>
            <div className="col-span-1 font-mono">
              {purchase.invoice_series || "-"}-{purchase.invoice_number}
            </div>
            <div className="col-span-1 text-center">
              <Badge variant="outline" className="text-xs">
                {purchase.fel_document_type}
              </Badge>
            </div>
            <div className="col-span-1 font-mono text-xs">
              {purchase.supplier_nit}
            </div>
            <div className="col-span-3 truncate" title={purchase.supplier_name}>
              {purchase.supplier_name || <span className="text-muted-foreground">Sin proveedor</span>}
            </div>
            <div className="col-span-1 text-right font-mono">
              {formatCurrency(purchase.total_amount)}
            </div>
            <div className="col-span-1 text-right font-mono text-muted-foreground">
              {formatCurrency(purchase.vat_amount)}
            </div>
            <div className="col-span-1 text-center">
              {getOperationTypeName(purchase.operation_type_id)}
            </div>
            <div className="col-span-1 text-xs truncate" title={getAccountName(purchase.expense_account_id, expenseAccounts)}>
              {getAccountName(purchase.expense_account_id, expenseAccounts)}
            </div>
            <div className="col-span-1 flex items-center justify-end gap-1">
              {purchase.journal_entry_id && (
                <Badge variant="secondary" className="text-xs">Póliza</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // EDIT MODE: Show inputs
  return (
    <Card 
      ref={cardRef}
      className={cn(
        "shadow-md transition-all ring-2 ring-primary border-primary",
        hasChanges && "ring-amber-400 border-amber-400",
        isHighlighted && "ring-primary border-primary bg-accent/20 animate-pulse"
      )}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Primera fila: Fecha, info documento, NIT y proveedor */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input
                ref={dateInputRef}
                id={`purchase-${index}-invoice_date`}
                type="date"
                value={purchase.invoice_date}
                onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
                className="h-8"
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Serie</label>
              <Input
                id={`purchase-${index}-invoice_series`}
                value={purchase.invoice_series}
                onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                placeholder="A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                id={`purchase-${index}-invoice_number`}
                value={purchase.invoice_number}
                onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                placeholder="12345"
                className="h-8"
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Tipo Doc</label>
              <Select
                value={purchase.fel_document_type}
                onValueChange={(v) => handleFieldChange("fel_document_type", v)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {felDocTypes.map((type) => (
                    <SelectItem key={type.code} value={type.code}>
                      {type.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">NIT</label>
              <Input
                value={purchase.supplier_nit}
                onChange={(e) => handleFieldChange("supplier_nit", e.target.value.replace(/-/g, ""))}
                onBlur={(e) => searchSupplierByNit(e.target.value)}
                placeholder="123456789"
                className="h-8"
              />
            </div>
            <div className="col-span-4">
              <label className="text-xs text-muted-foreground">Proveedor</label>
              <Input
                value={purchase.supplier_name}
                onChange={(e) => handleFieldChange("supplier_name", e.target.value)}
                placeholder="Nombre del proveedor"
                className="h-8"
              />
            </div>
          </div>

          {/* Segunda fila: Montos, tipo operación, cuenta y referencia con botones */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Total c/IVA</label>
              <Input
                type="number"
                step="0.01"
                value={purchase.total_amount}
                onChange={(e) => handleFieldChange("total_amount", e.target.value)}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">IVA</label>
              <Input
                type="number"
                step="0.01"
                value={purchase.vat_amount}
                readOnly
                className="h-8 bg-muted"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Tipo Operación</label>
              <Select
                value={purchase.operation_type_id?.toString() || ""}
                onValueChange={(v) => handleFieldChange("operation_type_id", v ? parseInt(v) : null)}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {operationTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id.toString()}>
                      {type.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-3">
              <label className="text-xs text-muted-foreground">Cuenta</label>
              <AccountCombobox
                accounts={expenseAccounts}
                value={purchase.expense_account_id}
                onValueChange={(val) => handleFieldChange("expense_account_id", val)}
                placeholder="Cuenta de gasto..."
                className="w-full"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Ref. Pago</label>
              <Input
                value={purchase.batch_reference || ""}
                onChange={(e) => handleFieldChange("batch_reference", e.target.value)}
                placeholder="Cheque/Ref"
                className="h-8"
              />
            </div>
            <div className="col-span-1 flex items-end gap-1">
              <Button 
                size="sm" 
                variant={hasChanges ? "default" : "outline"} 
                onClick={handleSaveClick}
                className="h-8 w-8 p-0"
                title="Guardar"
              >
                <Save className="h-3 w-3" />
              </Button>
              {!isNewRecord && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleCancelClick}
                  className="h-8 w-8 p-0"
                  title="Cancelar"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => onDelete(index)} 
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                title="Eliminar"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Tercera fila condicional: Banco (solo si hay Ref.Pago) */}
          {purchase.batch_reference && (
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12">
                <label className="text-xs text-muted-foreground">Banco</label>
                <AccountCombobox
                  accounts={bankAccounts}
                  value={purchase.bank_account_id}
                  onValueChange={(val) => handleFieldChange("bank_account_id", val)}
                  placeholder="Seleccionar cuenta bancaria..."
                  className="w-full"
                />
              </div>
            </div>
          )}

          {purchase.journal_entry_id && (
            <div className="pt-2 border-t">
              <Badge variant="secondary">Póliza generada</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

PurchaseCard.displayName = "PurchaseCard";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
}

export function PurchaseCard({ purchase, index, felDocTypes, operationTypes, expenseAccounts, bankAccounts, onUpdate, onSave, onDelete }: PurchaseCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Función para manejar cambios y marcar que hay cambios pendientes
  const handleFieldChange = (field: keyof PurchaseEntry, value: any) => {
    setHasChanges(true);
    onUpdate(index, field, value);
  };

  // Auto-guardar con debounce cuando hay cambios
  useEffect(() => {
    if (hasChanges) {
      // Limpiar timeout anterior
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      // Guardar después de 2 segundos de inactividad
      saveTimeoutRef.current = setTimeout(() => {
        onSave(index);
        setHasChanges(false);
      }, 2000);
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [hasChanges, purchase]);

  // Guardar al desmontar si hay cambios pendientes
  useEffect(() => {
    return () => {
      if (hasChanges) {
        onSave(index);
      }
    };
  }, []);

  return (
    <Card 
      ref={cardRef}
      className={cn(
        "hover:shadow-md transition-all",
        isFocused && "ring-2 ring-green-500 border-green-500",
        hasChanges && "ring-1 ring-amber-400"
      )}
    >
      <CardContent className="p-4">
        <div 
          className="space-y-3"
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            // Solo quitar el foco visual, no guardar automáticamente aquí
            const relatedTarget = e.relatedTarget as Node | null;
            const isInsideCard = cardRef.current?.contains(relatedTarget);
            const isInsidePortal = relatedTarget && document.querySelector('[data-radix-popper-content-wrapper]')?.contains(relatedTarget);
            
            if (!isInsideCard && !isInsidePortal) {
              setIsFocused(false);
            }
          }}
        >
          {/* Primera fila: Info documento, NIT y proveedor */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Serie</label>
              <Input
                value={purchase.invoice_series}
                onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                placeholder="A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                value={purchase.invoice_number}
                onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                placeholder="12345"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input
                type="date"
                value={purchase.invoice_date}
                onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
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
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">NIT</label>
              <Input
                value={purchase.supplier_nit}
                onChange={(e) => handleFieldChange("supplier_nit", e.target.value)}
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
                onClick={() => {
                  onSave(index);
                  setHasChanges(false);
                  if (saveTimeoutRef.current) {
                    clearTimeout(saveTimeoutRef.current);
                  }
                }} 
                className="h-8 w-8 p-0"
              >
                <Save className="h-3 w-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDelete(index)} className="h-8 w-8 p-0">
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
}

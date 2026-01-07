import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save, Ban, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SaleEntry {
  id?: number;
  invoice_series: string;
  invoice_number: string;
  invoice_date: string;
  fel_document_type: string;
  customer_nit: string;
  customer_name: string;
  total_amount: number;
  vat_amount: number;
  net_amount: number;
  operation_type_id: number | null;
  income_account_id: number | null;
  journal_entry_id: number | null;
  is_annulled?: boolean;
  isNew?: boolean;
  establishment_code?: string | null;
  establishment_name?: string | null;
}

interface SalesCardProps {
  sale: SaleEntry;
  index: number;
  felDocTypes: { code: string; name: string }[];
  operationTypes: { id: number; code: string; name: string }[];
  incomeAccounts: { id: number; account_code: string; account_name: string }[];
  onUpdate: (index: number, field: keyof SaleEntry, value: any) => void;
  onSave: (index: number) => void;
  onDelete: (index: number) => void;
  onToggleAnnulled: (index: number) => void;
  isHighlighted?: boolean;
}

export function SalesCard({ sale, index, felDocTypes, operationTypes, incomeAccounts, onUpdate, onSave, onDelete, onToggleAnnulled, isHighlighted }: SalesCardProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const searchCustomerByNit = async (nit: string) => {
    if (!nit || nit.length < 3) return;
    
    try {
      const { data, error } = await supabase
        .from("tab_sales_ledger")
        .select("customer_name, customer_nit")
        .eq("customer_nit", nit)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        onUpdate(index, "customer_name", data.customer_name);
      }
    } catch (error) {
      console.error("Error searching customer:", error);
    }
  };

  // Función para manejar cambios y marcar que hay cambios pendientes
  const handleFieldChange = (field: keyof SaleEntry, value: any) => {
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
  }, [hasChanges, sale]);

  // Guardar al desmontar si hay cambios pendientes
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

  return (
    <Card 
      ref={cardRef}
      className={cn(
        "hover:shadow-md transition-all",
        isFocused && "ring-2 ring-green-500 border-green-500",
        hasChanges && "ring-1 ring-amber-400",
        isHighlighted && "ring-2 ring-blue-500 border-blue-500 bg-blue-50 dark:bg-blue-950/30 animate-pulse",
        sale.is_annulled && "opacity-60 bg-red-50 dark:bg-red-950/20"
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
          {/* Primera fila: Fecha, info documento, NIT y cliente */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2 flex items-end gap-1">
              {sale.is_annulled && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Ban className="h-4 w-4 text-red-500 mb-2" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Factura anulada</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Fecha</label>
                <Input
                  type="date"
                  value={sale.invoice_date}
                  onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
                  className="h-8"
                />
              </div>
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Serie</label>
              <Input
                value={sale.invoice_series}
                onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                placeholder="A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                value={sale.invoice_number}
                onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                placeholder="12345"
                className="h-8"
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Tipo Doc</label>
              <Select
                value={sale.fel_document_type}
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
                value={sale.customer_nit}
                onChange={(e) => handleFieldChange("customer_nit", e.target.value)}
                onBlur={(e) => searchCustomerByNit(e.target.value)}
                placeholder="123456789"
                className="h-8"
              />
            </div>
            <div className={sale.establishment_name ? "col-span-2" : "col-span-4"}>
              <label className="text-xs text-muted-foreground">Cliente</label>
              <Input
                value={sale.customer_name}
                onChange={(e) => handleFieldChange("customer_name", e.target.value)}
                placeholder="Nombre del cliente"
                className="h-8"
              />
            </div>
            {sale.establishment_name && (
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Establecimiento</label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        value={`${sale.establishment_code || ""} - ${sale.establishment_name}`}
                        readOnly
                        className="h-8 bg-muted text-xs truncate"
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{sale.establishment_code} - {sale.establishment_name}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>

          {/* Segunda fila: Montos, tipo operación y cuenta con botones */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Total c/IVA</label>
              <Input
                type="number"
                step="0.01"
                value={sale.total_amount}
                onChange={(e) => handleFieldChange("total_amount", e.target.value)}
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">IVA</label>
              <Input
                type="number"
                step="0.01"
                value={sale.vat_amount}
                readOnly
                className="h-8 bg-muted"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Tipo Operación</label>
              <Select
                value={sale.operation_type_id?.toString() || ""}
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
            <div className="col-span-5">
              <label className="text-xs text-muted-foreground">Cuenta</label>
              <AccountCombobox
                accounts={incomeAccounts}
                value={sale.income_account_id}
                onValueChange={(val) => handleFieldChange("income_account_id", val)}
                placeholder="Cuenta de ingreso..."
                className="w-full"
              />
            </div>
            <div className="col-span-1 flex items-end gap-1">
              <TooltipProvider>
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant={sale.is_annulled ? "outline" : "ghost"}
                          className={cn(
                            "h-8 w-8 p-0",
                            sale.is_annulled && "text-green-600 hover:text-green-700 border-green-300"
                          )}
                        >
                          {sale.is_annulled ? <RotateCcw className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{sale.is_annulled ? "Reactivar factura" : "Anular factura"}</p>
                    </TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {sale.is_annulled ? "¿Reactivar esta factura?" : "¿Anular esta factura?"}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {sale.is_annulled 
                          ? `La factura ${sale.invoice_series}-${sale.invoice_number} será reactivada y se incluirá nuevamente en los cálculos.`
                          : `La factura ${sale.invoice_series}-${sale.invoice_number} será marcada como anulada. No se incluirá en los totales pero seguirá visible para las declaraciones fiscales.`
                        }
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onToggleAnnulled(index)}>
                        {sale.is_annulled ? "Reactivar" : "Anular"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TooltipProvider>
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

          {sale.journal_entry_id && (
            <div className="pt-2 border-t">
              <Badge variant="secondary">Póliza generada</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

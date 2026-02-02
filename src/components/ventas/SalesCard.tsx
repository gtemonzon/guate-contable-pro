import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save, Ban, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { cn, formatCurrency } from "@/lib/utils";
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
  isEditing?: boolean;
  onStartEdit?: (index: number) => void;
  onCancelEdit?: () => void;
}

export interface SalesCardRef {
  focusDateField: () => void;
}

export const SalesCard = forwardRef<SalesCardRef, SalesCardProps>(({ 
  sale, 
  index, 
  felDocTypes, 
  operationTypes, 
  incomeAccounts, 
  onUpdate, 
  onSave, 
  onDelete, 
  onToggleAnnulled, 
  isHighlighted,
  isEditing = false,
  onStartEdit,
  onCancelEdit
}, ref) => {
  const [hasChanges, setHasChanges] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNewRecord = sale.isNew;

  // Auto-enter edit mode for new records
  const inEditMode = isEditing || isNewRecord;

  useImperativeHandle(ref, () => ({
    focusDateField: () => {
      if (cardRef.current) {
        cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => {
        if (dateInputRef.current) {
          dateInputRef.current.focus();
        }
      }, 150);
    }
  }));

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

  const handleFieldChange = (field: keyof SaleEntry, value: any) => {
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
          isHighlighted && "ring-2 ring-primary border-primary bg-accent/20",
          sale.is_annulled && "opacity-60 bg-destructive/5"
        )}
        onClick={() => onStartEdit?.(index)}
      >
        <CardContent className="p-3">
          <div className="grid grid-cols-12 gap-2 items-center text-sm">
            <div className="col-span-1 text-muted-foreground flex items-center gap-1">
              {sale.is_annulled && <Ban className="h-3 w-3 text-destructive" />}
              {formatDate(sale.invoice_date)}
            </div>
            <div className="col-span-1 font-mono">
              {sale.invoice_series || "-"}-{sale.invoice_number}
            </div>
            <div className="col-span-1 text-center">
              <Badge variant="outline" className="text-xs">
                {sale.fel_document_type}
              </Badge>
            </div>
            <div className="col-span-1 font-mono text-xs">
              {sale.customer_nit}
            </div>
            <div className="col-span-3 truncate" title={sale.customer_name}>
              {sale.customer_name || <span className="text-muted-foreground">Sin cliente</span>}
            </div>
            <div className="col-span-1 text-right font-mono">
              {formatCurrency(sale.total_amount)}
            </div>
            <div className="col-span-1 text-right font-mono text-muted-foreground">
              {formatCurrency(sale.vat_amount)}
            </div>
            <div className="col-span-1 text-center">
              {getOperationTypeName(sale.operation_type_id)}
            </div>
            <div className="col-span-1 text-xs truncate" title={getAccountName(sale.income_account_id, incomeAccounts)}>
              {getAccountName(sale.income_account_id, incomeAccounts)}
            </div>
            <div className="col-span-1 flex items-center justify-end gap-1">
              {sale.journal_entry_id && (
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
        isHighlighted && "ring-primary border-primary bg-accent/20 animate-pulse",
        sale.is_annulled && "opacity-60 bg-destructive/5"
      )}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
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
                  ref={dateInputRef}
                  id={`sale-${index}-invoice_date`}
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
                id={`sale-${index}-invoice_series`}
                value={sale.invoice_series}
                onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                placeholder="A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                id={`sale-${index}-invoice_number`}
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
                onChange={(e) => handleFieldChange("customer_nit", e.target.value.replace(/-/g, ""))}
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
            <div className="col-span-4">
              <label className="text-xs text-muted-foreground">Cuenta</label>
              <AccountCombobox
                accounts={incomeAccounts}
                value={sale.income_account_id}
                onValueChange={(val) => handleFieldChange("income_account_id", val)}
                placeholder="Cuenta de ingreso..."
                className="w-full"
              />
            </div>
            <div className="col-span-2 flex items-end gap-1">
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

          {sale.journal_entry_id && (
            <div className="pt-2 border-t">
              <Badge variant="secondary">Póliza generada</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

SalesCard.displayName = "SalesCard";

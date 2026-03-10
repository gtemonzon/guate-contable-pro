import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save, X, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { validateNIT } from "@/utils/nitValidation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNitLookup } from "@/hooks/useNitLookup";

export interface PurchaseEntry {
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
  idp_amount: number;
  batch_reference: string;
  operation_type_id: number | null;
  expense_account_id: number | null;
  bank_account_id: number | null;
  journal_entry_id: number | null;
  purchase_book_id?: number;
  isNew?: boolean;
  _recommendedFields?: string[];
}

export interface PurchaseCardProps {
  purchase: PurchaseEntry;
  index: number;
  felDocTypes: { code: string; name: string }[];
  operationTypes: { id: number; code: string; name: string }[];
  expenseAccounts: { id: number; account_code: string; account_name: string }[];
  bankAccounts: { id: number; account_code: string; account_name: string }[];
  onUpdate: (index: number, field: keyof PurchaseEntry, value: any) => void;
  onSave: (index: number) => void;
  onDelete: (index: number) => void;
  recommendedFields?: string[];
  isHighlighted?: boolean;
  isEditing?: boolean;
  onStartEdit?: (index: number) => void;
  onCancelEdit?: () => void;
  /** 'full' shows all fields; 'compact' hides bank, operation, IDP, batch_reference */
  variant?: 'full' | 'compact';
  /** External duplicate warning to display */
  duplicateWarning?: string | null;
  /** Called on invoice_number blur for external duplicate checking */
  onCheckDuplicate?: (index: number) => void;
}

export interface PurchaseCardRef {
  focusDateField: () => void;
}

// Style for system-recommended values that user hasn't touched
const recommendedStyle = "italic text-muted-foreground/60";

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
  recommendedFields = [],
  isHighlighted,
  isEditing = false,
  onStartEdit,
  onCancelEdit,
  variant = 'full',
  duplicateWarning: externalDuplicateWarning,
  onCheckDuplicate,
}, ref) => {
  const [hasChanges, setHasChanges] = useState(false);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [nitError, setNitError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isNewRecord = purchase.isNew;
  const { lookupNit, isLooking: nitLooking } = useNitLookup();
  const isCompact = variant === 'compact';

  // Keep a ref to the latest purchase props to avoid stale closures in async callbacks
  const purchaseRef = useRef(purchase);
  purchaseRef.current = purchase;

  // Check if operation type is COMBUSTIBLE (fuel) to show IDP field
  const isFuelOperation = operationTypes.find(t => t.id === purchase.operation_type_id)?.code === "COMBUSTIBLE";

  // Auto-enter edit mode for new records
  const inEditMode = isEditing || isNewRecord;

  // Check if a field is a system recommendation (not touched by user)
  const isRecommended = (field: string): boolean => {
    if (!isNewRecord) return false;
    return recommendedFields.includes(field) && !touchedFields.has(field);
  };

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

  const searchSupplierByNit = async (nit: string) => {
    if (!nit || nit.length < 2) return;
    const result = await lookupNit(nit);
    if (result?.found && !purchaseRef.current.supplier_name.trim()) {
      onUpdate(index, "supplier_name", result.name);
    }
  };

  const handleFieldChange = (field: keyof PurchaseEntry, value: any) => {
    setHasChanges(true);
    setTouchedFields(prev => new Set(prev).add(field));
    onUpdate(index, field, value);
  };

  // Clear untouched recommended optional fields before saving
  const clearUntouchedRecommendedFields = () => {
    if (!isNewRecord) return;
    const optionalRecommendedFields = ['expense_account_id', 'bank_account_id', 'operation_type_id'];
    optionalRecommendedFields.forEach(field => {
      if (recommendedFields.includes(field) && !touchedFields.has(field)) {
        onUpdate(index, field as keyof PurchaseEntry, null);
      }
    });
  };

  // Auto-save with debounce when there are changes
  useEffect(() => {
    if (hasChanges && inEditMode) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        const activeEl = document.activeElement as HTMLElement | null;
        const activeId = cardRef.current?.contains(activeEl) ? activeEl?.id : null;
        
        onSave(index);
        setHasChanges(false);
        
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
    clearUntouchedRecommendedFields();
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

  const dupWarning = externalDuplicateWarning || null;

  // ─── READ-ONLY MODE ──────────────────────────────────────────────────────
  if (!inEditMode) {
    if (isCompact) {
      return (
        <Card 
          ref={cardRef}
          className={cn(
            "hover:bg-muted/50 cursor-pointer transition-colors group",
            isHighlighted && "ring-2 ring-primary border-primary bg-accent/20",
            dupWarning && "border-destructive/50 bg-destructive/5",
          )}
          onClick={() => onStartEdit?.(index)}
        >
          <CardContent className="p-2.5">
            <div className="grid grid-cols-12 gap-2 items-center text-sm">
              <div className="col-span-1 text-xs text-muted-foreground">
                {formatDate(purchase.invoice_date)}
              </div>
              <div className="col-span-1 text-center">
                <Badge variant="outline" className="text-[10px]">{purchase.fel_document_type}</Badge>
              </div>
              <div className="col-span-1 font-mono text-xs">
                {purchase.invoice_series ? `${purchase.invoice_series}-` : ""}{purchase.invoice_number}
              </div>
              <div className="col-span-1 font-mono text-xs">{purchase.supplier_nit}</div>
              <div className="col-span-3 truncate text-xs" title={purchase.supplier_name}>
                {purchase.supplier_name || <span className="text-muted-foreground">Sin proveedor</span>}
              </div>
              <div className="col-span-2 text-right font-mono text-xs font-medium">
                {formatCurrency(purchase.total_amount)}
              </div>
              <div className="col-span-1 text-right font-mono text-[11px] text-muted-foreground">
                {formatCurrency(purchase.vat_amount)}
              </div>
              <div className="col-span-2 text-xs truncate flex items-center gap-1" title={getAccountName(purchase.expense_account_id, expenseAccounts)}>
                {getAccountName(purchase.expense_account_id, expenseAccounts)}
                {purchase.journal_entry_id && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">Póliza</Badge>
                )}
                {dupWarning && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="inline h-3 w-3 ml-1 text-destructive" />
                    </TooltipTrigger>
                    <TooltipContent>{dupWarning}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Full read mode
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
              {purchase.idp_amount > 0 && (
                <span className="block text-[10px] text-muted-foreground/70">IDP: {formatCurrency(purchase.idp_amount)}</span>
              )}
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

  // ─── EDIT MODE ────────────────────────────────────────────────────────────
  if (isCompact) {
    return (
      <Card 
        ref={cardRef}
        className={cn(
          "shadow-md transition-all ring-2 ring-primary border-primary",
          hasChanges && "ring-amber-400 border-amber-400",
          dupWarning && "border-destructive/50 bg-destructive/5",
          isHighlighted && "ring-primary border-primary bg-accent/20 animate-pulse"
        )}
      >
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Row 1: Fecha, TipoDoc, Serie, Número, NIT, Proveedor */}
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
                <label className="text-xs text-muted-foreground">Tipo Doc.</label>
                <Select
                  value={purchase.fel_document_type}
                  onValueChange={(v) => handleFieldChange("fel_document_type", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {felDocTypes.map((type) => (
                      <SelectItem key={type.code} value={type.code}>{type.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-1">
                <label className="text-xs text-muted-foreground">Serie</label>
                <Input
                  id={`purchase-${index}-invoice_series`}
                  value={purchase.invoice_series}
                  onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                  placeholder="A"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Número</label>
                <Input
                  id={`purchase-${index}-invoice_number`}
                  value={purchase.invoice_number}
                  onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                  onBlur={() => onCheckDuplicate?.(index)}
                  placeholder="123456"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">NIT</label>
                <Input
                  value={purchase.supplier_nit}
                  onChange={(e) => {
                    const val = e.target.value.replace(/-/g, "");
                    handleFieldChange("supplier_nit", val);
                    if (nitError && validateNIT(val)) setNitError(null);
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val && !validateNIT(val)) {
                      setNitError("NIT inválido");
                    } else {
                      setNitError(null);
                    }
                    searchSupplierByNit(val);
                  }}
                  placeholder="123456789"
                  className={cn("h-8 text-xs", nitError && "border-destructive")}
                />
                {nitError && <p className="text-[10px] text-destructive mt-0.5">{nitError}</p>}
              </div>
              <div className="col-span-4">
                <label className="text-xs text-muted-foreground">Proveedor</label>
                <div className="relative">
                  <Input
                    value={purchase.supplier_name}
                    onChange={(e) => handleFieldChange("supplier_name", e.target.value)}
                    placeholder="Nombre del proveedor"
                    className="h-8 text-xs"
                  />
                  {nitLooking && (
                    <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Total, IVA, IDP (if fuel), Tipo Op, Cuenta Gasto */}
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Total c/IVA</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchase.total_amount || ""}
                  onChange={(e) => handleFieldChange("total_amount", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-1">
                <label className="text-xs text-muted-foreground">IVA</label>
                <Input
                  value={purchase.vat_amount ? formatCurrency(purchase.vat_amount) : "Q 0.00"}
                  readOnly
                  className="h-8 text-xs bg-muted"
                />
              </div>
              {isFuelOperation && (
                <div className="col-span-1">
                  <label className="text-xs text-muted-foreground">IDP</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={purchase.idp_amount || 0}
                    onChange={(e) => handleFieldChange("idp_amount", e.target.value)}
                    className="h-8 text-xs"
                    title="Impuesto a Distribución de Petróleo"
                  />
                </div>
              )}
              <div className="col-span-2 min-w-0">
                <label className="text-xs text-muted-foreground">
                  Tipo Op.
                  {isRecommended("operation_type_id") && (
                    <span className="ml-1 text-[10px] italic text-muted-foreground/50">(sug.)</span>
                  )}
                </label>
                <Select
                  value={purchase.operation_type_id?.toString() || ""}
                  onValueChange={(v) => handleFieldChange("operation_type_id", v ? parseInt(v) : null)}
                >
                  <SelectTrigger className={cn("h-8 text-xs", isRecommended("operation_type_id") && recommendedStyle)}>
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
              <div className={cn(isFuelOperation ? "col-span-3" : "col-span-5", "min-w-0")}>
                <label className="text-xs text-muted-foreground">Cuenta Gasto</label>
                <AccountCombobox
                  accounts={expenseAccounts}
                  value={purchase.expense_account_id}
                  onValueChange={(val) => handleFieldChange("expense_account_id", val)}
                  placeholder="Seleccionar cuenta..."
                  className="w-full"
                />
              </div>
              <div className="col-span-2 flex items-end gap-1">
                {dupWarning && (
                  <div className="flex items-center gap-1 text-destructive text-[10px] pb-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{dupWarning}</span>
                  </div>
                )}
                <div className="ml-auto flex gap-1">
                  <Button
                    size="sm"
                    variant={hasChanges ? "default" : "outline"}
                    onClick={handleSaveClick}
                    className="h-8 w-8 p-0"
                    title="Guardar"
                  >
                    <Save className="h-3 w-3" />
                  </Button>
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
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full edit mode
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
          {/* Row 1: Fecha, info documento, NIT y proveedor */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Fecha</label>
              <Input
                ref={dateInputRef}
                id={`purchase-${index}-invoice_date`}
                type="date"
                value={purchase.invoice_date}
                onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
                className={cn("h-8", isRecommended("invoice_date") && recommendedStyle)}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Serie</label>
              <Input
                id={`purchase-${index}-invoice_series`}
                value={purchase.invoice_series}
                onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                placeholder="Ej: A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                id={`purchase-${index}-invoice_number`}
                value={purchase.invoice_number}
                onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                onBlur={() => onCheckDuplicate?.(index)}
                placeholder="12345"
                className="h-8"
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">
                Tipo Doc
                {isRecommended("fel_document_type") && (
                  <span className="ml-1 text-[10px] italic text-muted-foreground/50">(sugerido)</span>
                )}
              </label>
              <Select
                value={purchase.fel_document_type}
                onValueChange={(v) => handleFieldChange("fel_document_type", v)}
              >
                <SelectTrigger className={cn("h-8", isRecommended("fel_document_type") && recommendedStyle)}>
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
                onChange={(e) => {
                  const val = e.target.value.replace(/-/g, "");
                  handleFieldChange("supplier_nit", val);
                  if (nitError && validateNIT(val)) setNitError(null);
                }}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (val && !validateNIT(val)) {
                    setNitError("NIT inválido");
                  } else {
                    setNitError(null);
                  }
                  searchSupplierByNit(val);
                }}
                placeholder="123456789"
                className={cn("h-8", nitError && "border-destructive")}
              />
              {nitError && <p className="text-[10px] text-destructive mt-0.5">{nitError}</p>}
            </div>
            <div className="col-span-4">
              <label className="text-xs text-muted-foreground">Proveedor</label>
              <div className="relative">
                <Input
                  value={purchase.supplier_name}
                  onChange={(e) => handleFieldChange("supplier_name", e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="h-8"
                />
                {nitLooking && (
                  <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          </div>

          {/* Row 2: Montos, tipo operación, cuenta y referencia */}
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
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">IVA</label>
              <Input
                type="number"
                step="0.01"
                value={purchase.vat_amount}
                readOnly
                className="h-8 bg-muted"
              />
            </div>
            {isFuelOperation && (
              <div className="col-span-1">
                <label className="text-xs text-muted-foreground">IDP</label>
                <Input
                  type="number"
                  step="0.01"
                  value={purchase.idp_amount || 0}
                  onChange={(e) => handleFieldChange("idp_amount", e.target.value)}
                  className="h-8"
                  title="Impuesto a Distribución de Petróleo"
                />
              </div>
            )}
            <div className="col-span-2 min-w-0">
              <label className="text-xs text-muted-foreground">
                Tipo Operación
                {isRecommended("operation_type_id") && (
                  <span className="ml-1 text-[10px] italic text-muted-foreground/50">(sugerido)</span>
                )}
              </label>
              <Select
                value={purchase.operation_type_id?.toString() || ""}
                onValueChange={(v) => handleFieldChange("operation_type_id", v ? parseInt(v) : null)}
              >
                <SelectTrigger className={cn("h-8", isRecommended("operation_type_id") && recommendedStyle)}>
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
            <div className={cn(isFuelOperation ? "col-span-3" : "col-span-4", "min-w-0")}>
              <label className="text-xs text-muted-foreground">
                Cuenta
                {isRecommended("expense_account_id") && (
                  <span className="ml-1 text-[10px] italic text-muted-foreground/50">(sugerido)</span>
                )}
              </label>
              <AccountCombobox
                accounts={expenseAccounts}
                value={purchase.expense_account_id}
                onValueChange={(val) => handleFieldChange("expense_account_id", val)}
                placeholder="Cuenta de gasto..."
                className={cn("w-full", isRecommended("expense_account_id") && recommendedStyle)}
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

          {/* Row 3 conditional: Bank (only if batch_reference exists) */}
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

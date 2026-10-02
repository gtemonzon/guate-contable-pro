import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useLedgerCardAutoSave, type LedgerSaveResult } from "@/hooks/useLedgerCardAutoSave";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trash2, Save, AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LedgerHistoryButton } from "@/components/audit/LedgerHistoryButton";
import { AccountCombobox } from "@/components/ui/account-combobox";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { validateNIT } from "@/utils/nitValidation";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NitAutocomplete } from "@/components/ui/nit-autocomplete";
import { useNitLookup } from "@/hooks/useNitLookup";
import { TAX_CATEGORIES } from "@/utils/purchaseTaxCalculation";
import { useTaxExemptionRules } from "@/hooks/useTaxExemptionRules";
import {
  resolveRowExemption, exemptionBadgeLabel, exemptionTooltip, type ResolvedTaxExemption,
} from "@/utils/taxExemption";

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
  /** Portion of invoice total NOT subject to VAT (No afecto): tourism, IDP, electricity, fiscal stamps, other. */
  exempt_amount?: number;
  /** Classification of the Non-VAT portion (TOURISM_TAX, IDP, ELECTRICITY_TAX, FISCAL_STAMP, OTHER). */
  tax_category?: string | null;
  batch_reference: string;
  operation_type_id: number | null;
  expense_account_id: number | null;
  bank_account_id: number | null;
  journal_entry_id: number | null;
  purchase_book_id?: number;
  /** Sellos de exención (Decreto 22-2026 u otra regla). */
  vat_rate_applied?: number | null;
  exemption_rule_code?: string | null;
  isNew?: boolean;
  _recommendedFields?: string[];
  /** Stable client-side UID for React key; survives insert (id assignment) so the input keeps focus. */
  _uid?: string;
}

export interface PurchaseCardProps {
  purchase: PurchaseEntry;
  /** Clave estable de la fila (_uid); todos los callbacks la reciben en vez de un índice. */
  rowKey: string;
  /** Enterprise ID for auto-suggest mapping lookups */
  enterpriseId?: number | null;
  felDocTypes: { code: string; name: string }[];
  operationTypes: { id: number; code: string; name: string }[];
  expenseAccounts: { id: number; account_code: string; account_name: string }[];
  bankAccounts: { id: number; account_code: string; account_name: string }[];
  onUpdate: (rowKey: string, field: keyof PurchaseEntry, value: PurchaseEntry[keyof PurchaseEntry]) => void;
  /** Guarda la fila; false = no se guardó (la tarjeta no se cierra). */
  onSave: (rowKey: string) => LedgerSaveResult | Promise<LedgerSaveResult>;
  onDelete: (rowKey: string) => void;
  recommendedFields?: string[];
  isHighlighted?: boolean;
  /** Marks the record as missing required classification fields */
  isIncomplete?: boolean;
  isEditing?: boolean;
  onStartEdit?: (rowKey: string) => void;
  onCancelEdit?: () => void;
  /** 'full' shows all fields; 'compact' hides bank, operation, IDP, batch_reference */
  variant?: 'full' | 'compact';
  /** External duplicate warning to display */
  duplicateWarning?: string | null;
  /** Called on invoice_number blur for external duplicate checking */
  onCheckDuplicate?: (rowKey: string) => void;
  /** Phase 2: when false, hide VAT/Base/Exento fields and relabel Total. */
  appliesVat?: boolean;
  /** Short label for the linked journal entry (e.g. "PD-13"). */
  journalEntryLabel?: string;
}

/** Insignia "Exonerado Decreto 22-2026" con la regla y su vigencia en el tooltip. */
function ExemptionBadge({ exemption, className }: { exemption: ResolvedTaxExemption; className?: string }) {
  // Dos líneas para que no desborde su columna: primera palabra arriba, resto abajo.
  const label = exemptionBadgeLabel(exemption);
  const spaceIndex = label.indexOf(" ");
  const lines = spaceIndex === -1 ? [label] : [label.slice(0, spaceIndex), label.slice(spaceIndex + 1)];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "block w-full min-w-0 text-[10px] border-emerald-500/50 text-emerald-700 dark:text-emerald-400 leading-tight text-center h-auto rounded-md",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {lines.map((line, i) => (
            <span key={i} className="block">{line}</span>
          ))}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{exemptionTooltip(exemption)}</TooltipContent>
    </Tooltip>
  );
}

export interface PurchaseCardRef {
  focusDateField: () => void;
  /** Guarda ya lo pendiente; true si no había nada o se guardó. */
  flush: () => Promise<boolean>;
}

// Style for system-recommended values that user hasn't touched
const recommendedStyle = "italic text-muted-foreground/60";

export const PurchaseCard = forwardRef<PurchaseCardRef, PurchaseCardProps>(({ 
  purchase, 
  rowKey, 
  enterpriseId,
  felDocTypes, 
  operationTypes, 
  expenseAccounts, 
  bankAccounts, 
  onUpdate, 
  onSave, 
  onDelete, 
  recommendedFields = [],
  isHighlighted,
  isIncomplete = false,
  isEditing = false,
  onStartEdit,
  onCancelEdit,
  variant = 'full',
  duplicateWarning: externalDuplicateWarning,
  onCheckDuplicate,
  appliesVat = true,
  journalEntryLabel,
}, ref) => {
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
  const [nitError, setNitError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const isNewRecord = purchase.isNew;
  const { hasChanges, markChanged, flush } = useLedgerCardAutoSave({ rowKey, onSave, cardRef });
  
  const isCompact = variant === 'compact';

  // Keep a ref to the latest purchase props to avoid stale closures in async callbacks
  const purchaseRef = useRef(purchase);
  purchaseRef.current = purchase;

  // Check if operation type is COMBUSTIBLE (fuel) to show IDP field
  const operationTypeCode = operationTypes.find(t => t.id === purchase.operation_type_id)?.code ?? null;
  const isFuelOperation = operationTypeCode === "COMBUSTIBLE";

  // Exención vigente (Decreto 22-2026: combustible oct–dic 2026): IVA 0, base = total,
  // sin IDP. Los montos los recalcula el padre; aquí solo cambia lo que se muestra.
  const { rules: exemptionRules, isLoaded: exemptionRulesLoaded } = useTaxExemptionRules();
  const exemption = resolveRowExemption(
    purchase,
    operationTypeCode,
    exemptionRules,
    exemptionRulesLoaded && operationTypes.length > 0,
  );
  // Con la exención el IDP también es 0: el campo se oculta.
  const showIdpField = isFuelOperation && !exemption;

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
    },
    flush: () => flush(),
  }));


  /** Auto-suggest operation type + expense account from last purchase for this supplier */
  const fetchSupplierMapping = async (nit: string) => {
    if (!enterpriseId || !nit || nit.length < 2) return;
    try {
      // Try RPC first
      try {
        const { data: mapping } = await supabase.rpc("get_last_purchase_mapping", {
          p_enterprise_id: enterpriseId,
          p_supplier_nit: nit,
        });
        if (mapping && (mapping as { operation_type_id?: number; expense_account_id?: number }).operation_type_id) {
          const m = mapping as { operation_type_id?: number; expense_account_id?: number };
          if (!touchedFields.has("operation_type_id") && m.operation_type_id) {
            onUpdate(rowKey, "operation_type_id", m.operation_type_id);
          }
          if (!touchedFields.has("expense_account_id") && m.expense_account_id) {
            onUpdate(rowKey, "expense_account_id", m.expense_account_id);
          }
          return;
        }
      } catch { /* RPC not available */ }

      // Fallback: direct query
      const { data: lastPurchase } = await supabase
        .from("tab_purchase_ledger")
        .select("operation_type_id, expense_account_id")
        .eq("enterprise_id", enterpriseId)
        .eq("supplier_nit", nit)
        .is("deleted_at", null)
        .order("invoice_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastPurchase) {
        if (!touchedFields.has("operation_type_id") && lastPurchase.operation_type_id) {
          onUpdate(rowKey, "operation_type_id", lastPurchase.operation_type_id);
        }
        if (!touchedFields.has("expense_account_id") && lastPurchase.expense_account_id) {
          onUpdate(rowKey, "expense_account_id", lastPurchase.expense_account_id);
        }
      }
    } catch {
      // Non-critical, ignore
    }
  };

  const { lookupNit } = useNitLookup();

  /** On NIT blur: fill supplier_name from local taxpayer cache if empty/unchanged */
  const fetchSupplierNameFromNit = async (nit: string) => {
    const current = purchaseRef.current.supplier_name?.trim();
    if (current) return; // don't overwrite user-provided name
    const result = await lookupNit(nit);
    if (result?.found && result.name) {
      onUpdate(rowKey, "supplier_name", result.name);
    }
  };

  /** Shortcut: pressing "+" in the NIT field repeats the last NIT entered in this book */
  const repeatLastNit = async () => {
    if (!enterpriseId) return;
    try {
      const { data } = await supabase
        .from("tab_purchase_ledger")
        .select("supplier_nit, supplier_name")
        .eq("enterprise_id", enterpriseId)
        .is("deleted_at", null)
        .not("supplier_nit", "is", null)
        .neq("supplier_nit", "")
        .order("created_at", { ascending: false })
        .limit(5);

      const last = (data ?? []).find((r) => r.supplier_nit?.trim());
      if (!last?.supplier_nit) return;
      const nit = last.supplier_nit.replace(/[-\s]/g, "").toUpperCase();
      handleFieldChange("supplier_nit", nit);
      if (last.supplier_name) handleFieldChange("supplier_name", last.supplier_name);
      if (nit && !validateNIT(nit)) {
        setNitError("NIT inválido");
      } else {
        setNitError(null);
        fetchSupplierMapping(nit);
      }
    } catch (error) {
      console.warn("repeatLastNit falló:", error);
    }
  };




  const handleFieldChange = (field: keyof PurchaseEntry, value: PurchaseEntry[keyof PurchaseEntry]) => {
    markChanged();
    setTouchedFields(prev => new Set(prev).add(field));
    onUpdate(rowKey, field, value);
  };

  /**
   * IDP UI shortcut: writes to the unified `exempt_amount` field and
   * auto-classifies as IDP. The Category → Account mapping is resolved
   * downstream by the Journal Entry Generator using enterprise config.
   */
  const handleIdpChange = (rawValue: string) => {
    const numeric = parseFloat(rawValue) || 0;
    markChanged();
    setTouchedFields(prev => new Set(prev).add("exempt_amount").add("tax_category"));
    onUpdate(rowKey, "exempt_amount", numeric);
    onUpdate(rowKey, "tax_category", numeric > 0 ? "IDP" : (purchase.tax_category ?? null));
  };
  const idpDisplayValue = ((purchase.tax_category ?? null) === "IDP")
    ? (purchase.exempt_amount || 0)
    : 0;

  // Clear untouched recommended optional fields before saving
  const clearUntouchedRecommendedFields = () => {
    if (!isNewRecord) return;
    const optionalRecommendedFields = ['expense_account_id', 'bank_account_id', 'operation_type_id'];
    optionalRecommendedFields.forEach(field => {
      if (recommendedFields.includes(field) && !touchedFields.has(field)) {
        onUpdate(rowKey, field as keyof PurchaseEntry, null);
      }
    });
  };

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

  // Disco = "Guardar y cerrar": guarda lo pendiente y solo cierra si se guardó.
  // En una fila nueva siempre intenta guardar (aunque no haya cambios registrados).
  const handleSaveClick = async () => {
    clearUntouchedRecommendedFields();
    const ok = await flush({ force: !!isNewRecord });
    if (ok) onCancelEdit?.();
  };

  // ESC: guarda lo pendiente y cierra (si no se pudo guardar, sigue en edición).
  const handleEscapeClose = async () => {
    const ok = await flush();
    if (ok) onCancelEdit?.();
  };

  // ESC cierra el modo edición (excepto en registros nuevos)
  useEffect(() => {
    if (!inEditMode || isNewRecord) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        document.querySelector(
          '[data-radix-popper-content-wrapper], [role="listbox"][data-state="open"]'
        )
      ) {
        return;
      }
      void handleEscapeClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inEditMode, isNewRecord, handleEscapeClose]);

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
            isIncomplete && !isHighlighted && "ring-1 ring-destructive/50 border-destructive/40",
            isHighlighted && "ring-2 ring-primary border-primary bg-accent/20",
            dupWarning && "border-destructive/50 bg-destructive/5",
          )}
          onClick={() => onStartEdit?.(rowKey)}
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
                {appliesVat ? formatCurrency(purchase.vat_amount) : ""}
                {exemption && <ExemptionBadge exemption={exemption} className="ml-1 px-1 py-0 text-[9px]" />}
              </div>
              <div className="col-span-2 text-xs truncate flex items-center gap-1" title={getAccountName(purchase.expense_account_id, expenseAccounts)}>
                {getAccountName(purchase.expense_account_id, expenseAccounts)}
                {purchase.journal_entry_id && (
                  <Badge variant="secondary" className="text-[10px] shrink-0">{journalEntryLabel || "Póliza"}</Badge>
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
          isIncomplete && !isHighlighted && "ring-1 ring-destructive/50 border-destructive/40",
          isHighlighted && "ring-2 ring-primary border-primary bg-accent/20"
        )}
        onClick={() => onStartEdit?.(rowKey)}
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
              {appliesVat ? formatCurrency(purchase.vat_amount) : ""}
              {exemption && <ExemptionBadge exemption={exemption} className="block mt-0.5 w-fit ml-auto px-1 py-0 text-[9px]" />}
              {appliesVat && (purchase.exempt_amount || 0) > 0 && (
                <span className="block text-[10px] text-muted-foreground/70">No afecto: {formatCurrency(purchase.exempt_amount || 0)}</span>
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
                <Badge variant="secondary" className="text-xs">{journalEntryLabel || "Póliza"}</Badge>
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
                  id={`purchase-${rowKey}-invoice_date`}
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
                  id={`purchase-${rowKey}-invoice_series`}
                  value={purchase.invoice_series}
                  onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                  placeholder="A"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Número</label>
                <Input
                  id={`purchase-${rowKey}-invoice_number`}
                  value={purchase.invoice_number}
                  onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                  onBlur={() => onCheckDuplicate?.(rowKey)}
                  placeholder="123456"
                  className="h-8 text-xs"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">NIT</label>
                <NitAutocomplete
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
                      if (val && validateNIT(val)) {
                        const cleaned = val.replace(/[-\s]/g, "").toUpperCase();
                        fetchSupplierMapping(cleaned);
                        fetchSupplierNameFromNit(cleaned);
                      }
                    }
                  }}
                  onSelectTaxpayer={(nit, name) => {
                    handleFieldChange("supplier_nit", nit);
                    handleFieldChange("supplier_name", name);
                    fetchSupplierMapping(nit);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "+") {
                      e.preventDefault();
                      repeatLastNit();
                    }
                  }}
                  title="Presiona + para repetir el último NIT ingresado"
                  placeholder="123456789"
                  className={cn("h-8 text-xs", nitError && "border-destructive")}
                />
                {nitError && <p className="text-[10px] text-destructive mt-0.5">{nitError}</p>}
              </div>
              <div className="col-span-4">
                <label className="text-xs text-muted-foreground">Proveedor</label>
                <Input
                  value={purchase.supplier_name}
                  onChange={(e) => handleFieldChange("supplier_name", e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {/* Row 2: Total, Exento, IVA, IDP (if fuel), Tipo Op, Cuenta Gasto */}
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">{appliesVat ? "Total c/IVA" : "Total"}</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchase.total_amount || ""}
                  onChange={(e) => handleFieldChange("total_amount", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              {appliesVat && (
                <>
                  {!isFuelOperation && (
                    <div className="col-span-1">
                      <label
                        className="text-xs text-muted-foreground"
                        title="Porción no afecta a IVA: turismo, timbres, electricidad, otros"
                      >
                        Exento
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={purchase.exempt_amount || ""}
                        onChange={(e) => handleFieldChange("exempt_amount", e.target.value)}
                        placeholder="0.00"
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                  <div className="col-span-1">
                    <label className="text-xs text-muted-foreground">Base</label>
                    <Input
                      value={purchase.base_amount ? formatCurrency(purchase.base_amount) : "Q 0.00"}
                      readOnly
                      className="h-8 text-xs bg-muted"
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
                </>
              )}
              {exemption && (
                <div className="col-span-1 min-w-0 flex items-end pb-1.5">
                  <ExemptionBadge exemption={exemption} />
                </div>
              )}
              {showIdpField && (
                <div className="col-span-1">
                  <label className="text-xs text-muted-foreground">IDP</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={idpDisplayValue}
                    onChange={(e) => handleIdpChange(e.target.value)}
                    className="h-8 text-xs"
                    title="Impuesto a Distribución de Petróleo"
                  />
                </div>
              )}
              <div className={cn(isFuelOperation ? "col-span-2" : "col-span-2", "min-w-0")}>
                <label className="text-xs text-muted-foreground">
                  Tipo Op.
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
              <div className={cn(isFuelOperation ? "col-span-2" : "col-span-3", "min-w-0")}>
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
                    title="Guardar y cerrar"
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                  {purchase.id && !isNewRecord && (
                    <LedgerHistoryButton
                      entityType="tab_purchase_ledger"
                      entityId={purchase.id}
                      documentLabel={`${purchase.invoice_series ? `${purchase.invoice_series}-` : ""}${purchase.invoice_number}`}
                    />
                  )}
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => onDelete(rowKey)} 
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    title="Eliminar"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Row 3 conditional: tax category for the exempt portion */}
            {(purchase.exempt_amount || 0) > 0 && (
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-5">
                  <label className="text-xs text-muted-foreground">Categoría del monto exento</label>
                  <Select
                    value={purchase.tax_category || ""}
                    onValueChange={(v) => handleFieldChange("tax_category", v || null)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Seleccionar categoría..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_CATEGORIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
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
                id={`purchase-${rowKey}-invoice_date`}
                type="date"
                value={purchase.invoice_date}
                onChange={(e) => handleFieldChange("invoice_date", e.target.value)}
                className={cn("h-8", isRecommended("invoice_date") && recommendedStyle)}
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Serie</label>
              <Input
                id={`purchase-${rowKey}-invoice_series`}
                value={purchase.invoice_series}
                onChange={(e) => handleFieldChange("invoice_series", e.target.value)}
                placeholder="Ej: A"
                className="h-8"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Número</label>
              <Input
                id={`purchase-${rowKey}-invoice_number`}
                value={purchase.invoice_number}
                onChange={(e) => handleFieldChange("invoice_number", e.target.value)}
                onBlur={() => onCheckDuplicate?.(rowKey)}
                placeholder="12345"
                className="h-8"
              />
            </div>
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">
                Tipo Doc
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
              <NitAutocomplete
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
                    if (val && validateNIT(val)) {
                      const cleaned = val.replace(/[-\s]/g, "").toUpperCase();
                      fetchSupplierMapping(cleaned);
                      fetchSupplierNameFromNit(cleaned);
                    }
                  }
                }}
                onSelectTaxpayer={(nit, name) => {
                  handleFieldChange("supplier_nit", nit);
                  handleFieldChange("supplier_name", name);
                  fetchSupplierMapping(nit);
                }}
                onKeyDown={(e) => {
                  if (e.key === "+") {
                    e.preventDefault();
                    repeatLastNit();
                  }
                }}
                title="Presiona + para repetir el último NIT ingresado"
                placeholder="123456789"
                className={cn("h-8", nitError && "border-destructive")}
              />
              {nitError && <p className="text-[10px] text-destructive mt-0.5">{nitError}</p>}
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

          {/* Row 2: Montos, tipo operación, cuenta y referencia */}
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">{appliesVat ? "Total c/IVA" : "Total"}</label>
              <Input
                type="number"
                step="0.01"
                value={purchase.total_amount}
                onChange={(e) => handleFieldChange("total_amount", e.target.value)}
                className="h-8"
              />
            </div>
            {appliesVat && (
              <>
                {!isFuelOperation && (
                  <div className="col-span-1">
                    <label
                      className="text-xs text-muted-foreground"
                      title="Porción no afecta a IVA: turismo, timbres, electricidad, otros"
                    >
                      Exento
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={purchase.exempt_amount || ""}
                      onChange={(e) => handleFieldChange("exempt_amount", e.target.value)}
                      placeholder="0.00"
                      className="h-8"
                    />
                  </div>
                )}
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
              </>
            )}
            {exemption && (
              <div className="col-span-1 min-w-0 flex items-end pb-1.5">
                <ExemptionBadge exemption={exemption} />
              </div>
            )}
            {showIdpField && (
              <div className="col-span-1">
                <label className="text-xs text-muted-foreground">IDP</label>
                <Input
                  type="number"
                  step="0.01"
                  value={idpDisplayValue}
                  onChange={(e) => handleIdpChange(e.target.value)}
                  className="h-8"
                  title="Impuesto a Distribución de Petróleo"
                />
              </div>
            )}
            <div className="col-span-2 min-w-0">
              <label className="text-xs text-muted-foreground">
                Tipo Operación
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
            <div className={cn(isFuelOperation ? "col-span-2" : "col-span-3", "min-w-0")}>
              <label className="text-xs text-muted-foreground">
                Cuenta
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
                title="Guardar y cerrar"
              >
                <Save className="h-3 w-3" />
              </Button>
              {purchase.id && !isNewRecord && (
                <LedgerHistoryButton
                  entityType="tab_purchase_ledger"
                  entityId={purchase.id}
                  documentLabel={`${purchase.invoice_series ? `${purchase.invoice_series}-` : ""}${purchase.invoice_number}`}
                />
              )}
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => onDelete(rowKey)} 
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

          {/* Row 4 conditional: tax category for the exempt portion */}
          {(purchase.exempt_amount || 0) > 0 && (
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <label className="text-xs text-muted-foreground">Categoría del monto exento</label>
                <Select
                  value={purchase.tax_category || ""}
                  onValueChange={(v) => handleFieldChange("tax_category", v || null)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Seleccionar categoría..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_CATEGORIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <label className="text-xs text-muted-foreground">Base gravable</label>
                <Input
                  value={purchase.base_amount ? formatCurrency(purchase.base_amount) : "Q 0.00"}
                  readOnly
                  className="h-8 bg-muted"
                />
              </div>
            </div>
          )}

          {purchase.journal_entry_id && (
            <div className="pt-2 border-t">
              <Badge variant="secondary">{journalEntryLabel || "Póliza generada"}</Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
});

PurchaseCard.displayName = "PurchaseCard";

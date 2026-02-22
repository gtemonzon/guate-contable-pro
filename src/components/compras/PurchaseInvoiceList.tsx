import { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PurchaseCard, PurchaseCardRef, PurchaseEntry } from "./PurchaseCard";

interface PurchaseInvoiceListProps {
  purchases: PurchaseEntry[];
  /** 'full' shows all fields; 'compact' hides bank, operation, IDP, batch_reference */
  variant?: "full" | "compact";
  felDocTypes: { code: string; name: string }[];
  operationTypes: { id: number; code: string; name: string }[];
  expenseAccounts: { id: number; account_code: string; account_name: string }[];
  bankAccounts: { id: number; account_code: string; account_name: string }[];
  editingIndex: number | null;
  onEditingIndexChange: (index: number | null) => void;
  onUpdate: (index: number, field: keyof PurchaseEntry, value: any) => void;
  onSave: (index: number) => void;
  onDelete: (index: number) => void;
  onAdd: () => void;
  loading?: boolean;
  emptyMessage?: string;
  addButtonLabel?: string;
  /** Keyboard shortcut hint shown next to add button (e.g. "Alt+N") */
  addShortcutHint?: string;
  /** Per-purchase duplicate warnings keyed by index */
  duplicateWarnings?: Record<number, string | null>;
  /** Called on invoice_number blur for duplicate check */
  onCheckDuplicate?: (index: number) => void;
  /** Whether to focus the last card on mount (for newly added) */
  focusLastCard?: boolean;
  onFocusLastCardDone?: () => void;
  /** Recommended fields for new records */
  getRecommendedFields?: (index: number) => string[];
}

export function PurchaseInvoiceList({
  purchases,
  variant = "full",
  felDocTypes,
  operationTypes,
  expenseAccounts,
  bankAccounts,
  editingIndex,
  onEditingIndexChange,
  onUpdate,
  onSave,
  onDelete,
  onAdd,
  loading = false,
  emptyMessage = "No hay facturas. Haz clic en \"Agregar\" para comenzar.",
  addButtonLabel = "Agregar Factura",
  addShortcutHint,
  duplicateWarnings,
  onCheckDuplicate,
  focusLastCard = false,
  onFocusLastCardDone,
  getRecommendedFields,
}: PurchaseInvoiceListProps) {
  const lastCardRef = useRef<PurchaseCardRef>(null);

  // Focus last card when requested (e.g. after adding new)
  useEffect(() => {
    if (focusLastCard && purchases.length > 0) {
      setTimeout(() => {
        lastCardRef.current?.focusDateField();
        onFocusLastCardDone?.();
      }, 100);
    }
  }, [focusLastCard, purchases.length]);

  if (loading) {
    return <p className="text-center text-muted-foreground py-8">Cargando...</p>;
  }

  if (purchases.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-muted-foreground">{emptyMessage}</p>
        <Button onClick={onAdd} variant="outline" size="sm">
          <Plus className="mr-2 h-4 w-4" />
          {addButtonLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-medium text-sm">Facturas ({purchases.length})</h4>
        <Button onClick={onAdd} variant="outline" size="sm" title={addShortcutHint}>
          <Plus className="mr-2 h-4 w-4" />
          {addButtonLabel}
          {addShortcutHint && (
            <kbd className="ml-2 px-1 py-0.5 text-[10px] bg-muted rounded border text-muted-foreground font-mono">
              {addShortcutHint}
            </kbd>
          )}
        </Button>
      </div>
      {purchases.map((purchase, index) => (
        <PurchaseCard
          key={purchase.id ?? `new-${index}`}
          ref={index === purchases.length - 1 ? lastCardRef : undefined}
          purchase={purchase}
          index={index}
          variant={variant}
          felDocTypes={felDocTypes}
          operationTypes={operationTypes}
          expenseAccounts={expenseAccounts}
          bankAccounts={bankAccounts}
          onUpdate={onUpdate}
          onSave={onSave}
          onDelete={onDelete}
          recommendedFields={getRecommendedFields?.(index) ?? (purchase.isNew ? purchase._recommendedFields || [] : [])}
          isEditing={editingIndex === index}
          onStartEdit={(idx) => onEditingIndexChange(idx)}
          onCancelEdit={() => onEditingIndexChange(null)}
          duplicateWarning={duplicateWarnings?.[index] ?? null}
          onCheckDuplicate={onCheckDuplicate}
        />
      ))}
    </div>
  );
}

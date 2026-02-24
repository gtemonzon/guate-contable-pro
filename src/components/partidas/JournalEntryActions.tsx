import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle, Lock, Ban, FileEdit, Link2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { EntryStatus } from "./useJournalEntryForm";

interface JournalEntryActionsProps {
  entryToEdit: boolean;
  entryStatus: EntryStatus;
  isBalanced: boolean;
  loading: boolean;
  isReadOnly: boolean;
  canCreateEntries: boolean;
  canPostEntries: boolean;
  hasBankAccount: boolean;
  hasBankReference: boolean;
  totalDebit: number;
  totalCredit: number;
  imbalanceAmount: number;
  onCancel: () => void;
  onSaveDraft: () => void;
  onPost: () => void;
  onVoidCheque: () => void;
  onEditMetadata?: () => void;
  onLinkPurchases?: () => void;
  auditInfo: { createdBy: string | null; createdAt: string | null; updatedBy: string | null; updatedAt: string | null; } | null;
  formatDateTime: (d: string | null) => string;
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  borrador: 'Borrador',
  pendiente_revision: 'Pendiente de Revisión',
  aprobado: 'Aprobado',
  contabilizado: 'Contabilizado',
  rechazado: 'Rechazado',
};

const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
const modKey = isMac ? "⌘" : "Ctrl";

export function JournalEntryActions({
  entryToEdit, entryStatus, isBalanced, loading, isReadOnly, canCreateEntries, canPostEntries,
  hasBankAccount, hasBankReference, totalDebit, totalCredit, imbalanceAmount,
  onCancel, onSaveDraft, onPost, onVoidCheque, onEditMetadata, onLinkPurchases, auditInfo, formatDateTime,
}: JournalEntryActionsProps) {
  // Show void cheque when: bank account is set, has a reference, and entry is not already posted with amounts
  const showVoidCheque = hasBankAccount && hasBankReference;
  return (
    <>
      {entryToEdit && auditInfo && (
        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          {auditInfo.createdBy && <p><span className="font-medium">Creado por:</span> {auditInfo.createdBy} - {formatDateTime(auditInfo.createdAt)}</p>}
          {auditInfo.updatedBy && auditInfo.updatedAt && <p><span className="font-medium">Modificado por:</span> {auditInfo.updatedBy} - {formatDateTime(auditInfo.updatedAt)}</p>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {/* Draft warnings (non-blocking) */}
        {entryStatus !== 'contabilizado' && !isReadOnly && (totalDebit > 0 || totalCredit > 0) && !isBalanced && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>Descuadrada por <span className="font-mono font-medium">{formatCurrency(Math.abs(imbalanceAmount))}</span> — se puede guardar como borrador</span>
          </div>
        )}

        <div className="flex justify-between gap-2">
          <div className="flex items-center gap-2">
            {entryToEdit && (
              <Badge variant={entryStatus === 'contabilizado' ? 'default' : entryStatus === 'rechazado' ? 'destructive' : 'secondary'}>
                {entryStatus === 'borrador' ? 'Borrador (no afecta saldos)' : STATUS_LABELS[entryStatus]}
              </Badge>
            )}
          </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Shortcut hints */}
          {!isReadOnly && (
            <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground mr-1">
              {canCreateEntries && entryStatus !== 'contabilizado' && (
                <><kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono bg-muted">{modKey}⇧↵</kbd> Borrador</>
              )}
              {canPostEntries && entryStatus !== 'contabilizado' && (
                <><span className="mx-1">·</span><kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono bg-muted">{modKey}↵</kbd> Contabilizar</>
              )}
            </span>
          )}

          {onLinkPurchases && (
            <Button variant="outline" onClick={onLinkPurchases} disabled={loading} size="sm" className="text-primary">
              <Link2 className="mr-2 h-4 w-4" />
              Vincular Facturas
            </Button>
          )}

          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>

          {showVoidCheque && !isReadOnly && (
            <Button variant="outline" onClick={onVoidCheque} disabled={loading} className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/20">
              <Ban className="mr-2 h-4 w-4" />
              Anular Cheque
            </Button>
          )}

          {entryStatus === 'contabilizado' && onEditMetadata && !isReadOnly && (
            <Button variant="outline" onClick={onEditMetadata} disabled={loading}>
              <FileEdit className="mr-2 h-4 w-4" />
              Editar datos (no contables)
            </Button>
          )}

          {entryStatus !== 'contabilizado' && canCreateEntries && !isReadOnly && (
            <Button variant="secondary" onClick={onSaveDraft} disabled={loading}>
              <Save className="mr-2 h-4 w-4" />
              Guardar borrador
            </Button>
          )}

          {entryStatus !== 'contabilizado' && canPostEntries && !isReadOnly && (
            <Button onClick={onPost} disabled={loading || !isBalanced}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Contabilizar
            </Button>
          )}

          {isReadOnly && (
            <Badge variant="secondary" className="px-3 py-2">
              <Lock className="mr-2 h-4 w-4" />
              Período cerrado - Solo lectura
            </Badge>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

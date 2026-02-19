import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle, Lock } from "lucide-react";
import type { EntryStatus } from "./useJournalEntryForm";

interface JournalEntryActionsProps {
  entryToEdit: boolean;
  entryStatus: EntryStatus;
  isBalanced: boolean;
  loading: boolean;
  isReadOnly: boolean;
  canCreateEntries: boolean;
  canPostEntries: boolean;
  onCancel: () => void;
  onSaveDraft: () => void;
  onPost: () => void;
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

export function JournalEntryActions({
  entryToEdit, entryStatus, isBalanced, loading, isReadOnly, canCreateEntries, canPostEntries,
  onCancel, onSaveDraft, onPost, auditInfo, formatDateTime,
}: JournalEntryActionsProps) {
  return (
    <>
      {entryToEdit && auditInfo && (
        <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
          {auditInfo.createdBy && <p><span className="font-medium">Creado por:</span> {auditInfo.createdBy} - {formatDateTime(auditInfo.createdAt)}</p>}
          {auditInfo.updatedBy && auditInfo.updatedAt && <p><span className="font-medium">Modificado por:</span> {auditInfo.updatedBy} - {formatDateTime(auditInfo.updatedAt)}</p>}
        </div>
      )}

      <div className="flex justify-between gap-2">
        <div className="flex items-center gap-2">
          {entryToEdit && (
            <Badge variant={entryStatus === 'contabilizado' ? 'default' : entryStatus === 'rechazado' ? 'destructive' : 'secondary'}>
              {STATUS_LABELS[entryStatus]}
            </Badge>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>

          {entryStatus !== 'contabilizado' && canCreateEntries && !isReadOnly && (
            <Button variant="secondary" onClick={onSaveDraft} disabled={loading}>
              <Save className="mr-2 h-4 w-4" />
              Guardar
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
    </>
  );
}

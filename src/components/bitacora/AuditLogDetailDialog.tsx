import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Minus, Plus, Equal, ChevronDown, Settings2 } from "lucide-react";
import type { AuditLogEntry } from "@/pages/Bitacora";
import {
  categoriseChanges,
  getTableLabel,
  buildChangeSummary,
  ACTION_LABELS,
  type AuditFieldChange,
} from "@/constants/auditFieldRules";

interface AuditLogDetailDialogProps {
  log: AuditLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
};

function FieldChangeCard({ change, action }: { change: AuditFieldChange; action: string }) {
  const isAdded = action === "INSERT" || (action === "UPDATE" && change.oldValue === null);
  const isRemoved = action === "DELETE";

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center gap-2">
        {isAdded && <Plus className="h-4 w-4 text-green-600" />}
        {isRemoved && <Minus className="h-4 w-4 text-destructive" />}
        {!isAdded && !isRemoved && <Equal className="h-4 w-4 text-yellow-600" />}
        <span className="font-medium text-sm">{change.label}</span>
      </div>
      <div className="grid grid-cols-1 gap-2 text-xs">
        {change.oldValue !== null && (
          <div className="bg-destructive/10 rounded p-2">
            <span className="text-muted-foreground">Anterior: </span>
            <pre className="whitespace-pre-wrap break-all mt-1 text-destructive">
              {formatValue(change.oldValue)}
            </pre>
          </div>
        )}
        {change.newValue !== null && (
          <div className="bg-green-500/10 rounded p-2">
            <span className="text-muted-foreground">Nuevo: </span>
            <pre className="whitespace-pre-wrap break-all mt-1 text-green-700 dark:text-green-400">
              {formatValue(change.newValue)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditLogDetailDialog({ log, open, onOpenChange }: AuditLogDetailDialogProps) {
  const [systemOpen, setSystemOpen] = useState(false);

  const { meaningful, system } = log
    ? categoriseChanges(log.action, log.table_name, log.old_values, log.new_values)
    : { meaningful: [], system: [] };

  const summary = log
    ? buildChangeSummary(log.action, log.table_name, log.old_values, log.new_values)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        {log ? (
          <>
            {/* Fixed header */}
            <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border/40 space-y-3">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Detalle de Auditoría
                  <Badge variant={log.action === "DELETE" ? "destructive" : "secondary"}>
                    {ACTION_LABELS[log.action] || log.action}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {getTableLabel(log.table_name)} •{" "}
                  {format(new Date(log.created_at), " dd 'de' MMMM 'de' yyyy, HH:mm:ss", {
                    locale: es,
                  })}
                </DialogDescription>
              </DialogHeader>

              {/* Summary */}
              <div className="bg-muted/50 rounded-lg p-3 text-sm font-medium">
                {summary}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Usuario:</span>
                  <p className="font-medium">{log.user_name || "Sistema"}</p>
                  {log.user_email && (
                    <p className="text-xs text-muted-foreground">{log.user_email}</p>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Empresa:</span>
                  <p className="font-medium">{log.enterprise_name || "N/A"}</p>
                </div>
                {log.record_id && (
                  <div>
                    <span className="text-muted-foreground">ID Registro:</span>
                    <p className="font-mono">{log.record_id}</p>
                  </div>
                )}
                {log.ip_address && (
                  <div>
                    <span className="text-muted-foreground">Dirección IP:</span>
                    <p className="font-mono">{log.ip_address}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
              {/* Meaningful changes */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">
                  {log.action === "INSERT" && "Campos creados"}
                  {log.action === "UPDATE" && "Campos modificados"}
                  {log.action === "DELETE" && "Campos eliminados"}
                  {meaningful.length > 0 && (
                    <span className="ml-1 text-muted-foreground font-normal">
                      ({meaningful.length})
                    </span>
                  )}
                </h4>

                {meaningful.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-2">
                    Solo se modificaron campos del sistema.
                  </p>
                ) : (
                  meaningful.map((change) => (
                    <FieldChangeCard key={change.field} change={change} action={log.action} />
                  ))
                )}
              </div>

              {/* System changes — collapsible */}
              {system.length > 0 && (
                <Collapsible open={systemOpen} onOpenChange={setSystemOpen} className="mt-4">
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-between text-muted-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Cambios del sistema ({system.length})
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          systemOpen ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 mt-2">
                    {system.map((change) => (
                      <FieldChangeCard key={change.field} change={change} action={log.action} />
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </>
        ) : (
          <div className="p-6">
            <DialogHeader>
              <DialogTitle>Detalle de Auditoría</DialogTitle>
              <DialogDescription>Cargando...</DialogDescription>
            </DialogHeader>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

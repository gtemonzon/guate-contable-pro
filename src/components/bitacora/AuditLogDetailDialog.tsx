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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Minus, Plus, Equal } from "lucide-react";
import type { AuditLogEntry } from "@/pages/Bitacora";

interface AuditLogDetailDialogProps {
  log: AuditLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TABLE_NAME_LABELS: Record<string, string> = {
  tab_enterprises: "Empresas",
  tab_users: "Usuarios",
  tab_accounts: "Cuentas Contables",
  tab_journal_entries: "Partidas",
  tab_sales_ledger: "Libro de Ventas",
  tab_purchase_ledger: "Libro de Compras",
  tab_accounting_periods: "Períodos Contables",
  tab_user_enterprises: "Asignaciones Usuario-Empresa",
};

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Modificación",
  DELETE: "Eliminación",
};

const FIELD_LABELS: Record<string, string> = {
  id: "ID",
  enterprise_id: "ID Empresa",
  user_id: "ID Usuario",
  created_at: "Fecha de Creación",
  updated_at: "Fecha de Actualización",
  business_name: "Razón Social",
  trade_name: "Nombre Comercial",
  nit: "NIT",
  is_active: "Activo",
  full_name: "Nombre Completo",
  email: "Correo Electrónico",
  account_code: "Código de Cuenta",
  account_name: "Nombre de Cuenta",
  account_type: "Tipo de Cuenta",
  balance_type: "Tipo de Saldo",
  description: "Descripción",
  entry_date: "Fecha de Partida",
  entry_number: "Número de Partida",
  total_debit: "Total Débito",
  total_credit: "Total Crédito",
  status: "Estado",
  invoice_date: "Fecha de Factura",
  invoice_number: "Número de Factura",
  supplier_name: "Nombre del Proveedor",
  customer_name: "Nombre del Cliente",
  total_amount: "Monto Total",
  vat_amount: "IVA",
  net_amount: "Monto Neto",
  deleted_at: "Fecha de Eliminación",
  deleted_by: "Eliminado por",
  role: "Rol",
  tenant_id: "ID Tenant",
};

export function AuditLogDetailDialog({ log, open, onOpenChange }: AuditLogDetailDialogProps) {
  if (!log) return null;

  const getChangedFields = () => {
    if (log.action === "INSERT") {
      return Object.entries(log.new_values || {}).map(([key, value]) => ({
        field: key,
        oldValue: null,
        newValue: value,
        type: "added" as const,
      }));
    }

    if (log.action === "DELETE") {
      return Object.entries(log.old_values || {}).map(([key, value]) => ({
        field: key,
        oldValue: value,
        newValue: null,
        type: "removed" as const,
      }));
    }

    // UPDATE - show differences
    const oldValues = log.old_values || {};
    const newValues = log.new_values || {};
    const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

    return Array.from(allKeys)
      .map((key) => {
        const oldVal = oldValues[key];
        const newVal = newValues[key];
        const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);

        return {
          field: key,
          oldValue: oldVal,
          newValue: newVal,
          type: changed ? ("changed" as const) : ("unchanged" as const),
        };
      })
      .filter((f) => f.type === "changed"); // Only show changed fields for UPDATE
  };

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "Sí" : "No";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  const changedFields = getChangedFields();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle de Auditoría
            <Badge variant={log.action === "DELETE" ? "destructive" : "secondary"}>
              {ACTION_LABELS[log.action] || log.action}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {TABLE_NAME_LABELS[log.table_name] || log.table_name} • 
            {format(new Date(log.created_at), " dd 'de' MMMM 'de' yyyy, HH:mm:ss", { locale: es })}
          </DialogDescription>
        </DialogHeader>

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

        <Separator />

        <div>
          <h4 className="font-semibold mb-3">
            {log.action === "INSERT" && "Campos creados"}
            {log.action === "UPDATE" && "Campos modificados"}
            {log.action === "DELETE" && "Campos eliminados"}
          </h4>

          <ScrollArea className="h-[300px] pr-4">
            {changedFields.length === 0 ? (
              <p className="text-muted-foreground text-sm">No hay cambios registrados.</p>
            ) : (
              <div className="space-y-3">
                {changedFields.map((change) => (
                  <div
                    key={change.field}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      {change.type === "added" && (
                        <Plus className="h-4 w-4 text-green-600" />
                      )}
                      {change.type === "removed" && (
                        <Minus className="h-4 w-4 text-destructive" />
                      )}
                      {change.type === "changed" && (
                        <Equal className="h-4 w-4 text-yellow-600" />
                      )}
                      <span className="font-medium text-sm">
                        {FIELD_LABELS[change.field] || change.field}
                      </span>
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
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
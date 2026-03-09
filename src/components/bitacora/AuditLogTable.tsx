import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { AuditLogEntry } from "@/pages/Bitacora";
import {
  getTableLabel,
  buildChangeSummary,
  ACTION_LABELS,
} from "@/constants/auditFieldRules";

const ACTION_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = {
  INSERT: "default",
  UPDATE: "secondary",
  DELETE: "destructive",
};

interface AuditLogTableProps {
  logs: AuditLogEntry[];
  loading: boolean;
  onViewDetails: (log: AuditLogEntry) => void;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export function AuditLogTable({
  logs,
  loading,
  onViewDetails,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: AuditLogTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No se encontraron registros de auditoría.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Fecha/Hora</TableHead>
              <TableHead className="w-[200px]">Usuario</TableHead>
              <TableHead className="w-[120px]">Acción</TableHead>
              <TableHead className="w-[150px]">Entidad</TableHead>
              <TableHead>Resumen</TableHead>
              <TableHead className="w-[80px]">Detalles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              const summary = buildChangeSummary(
                log.action,
                log.table_name,
                log.old_values,
                log.new_values,
              );

              return (
                <TableRow key={log.id}>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", {
                      locale: es,
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">
                        {log.user_name || "Sistema"}
                      </span>
                      {log.user_email && (
                        <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {log.user_email}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ACTION_VARIANTS[log.action] || "secondary"}>
                      {ACTION_LABELS[log.action] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {getTableLabel(log.table_name)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px]">
                    <TruncatedText text={summary} className="text-sm" inline />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onViewDetails(log)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Mostrando {(page - 1) * pageSize + 1} -{" "}
          {Math.min(page * pageSize, totalCount)} de {totalCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

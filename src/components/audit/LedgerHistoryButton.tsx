import { useEffect, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { History, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import EntityAuditLog from "@/components/audit/EntityAuditLog";

type LedgerTable = "tab_purchase_ledger" | "tab_sales_ledger";

interface LedgerHistoryButtonProps {
  entityType: LedgerTable;
  entityId: number;
  /** Etiqueta de la factura para el título (ej. "A-1234"). */
  documentLabel?: string;
}

interface CreationInfo {
  createdAt: string | null;
  createdByName: string | null;
  hasAuthor: boolean;
}

/**
 * Botón "Historial" para una factura de los libros fiscales. Abre un diálogo con
 * la autoría de creación (created_by / created_at de la propia fila) y la línea
 * de tiempo de tab_audit_log. Como INSERT no se audita en estas tablas, la
 * línea de tiempo arranca en la primera modificación; la cabecera cubre la creación.
 */
export function LedgerHistoryButton({ entityType, entityId, documentLabel }: LedgerHistoryButtonProps) {
  const [open, setOpen] = useState(false);
  const [creation, setCreation] = useState<CreationInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const fetchCreation = async () => {
      const { data: row } = await supabase
        .from(entityType)
        .select("created_at, created_by")
        .eq("id", entityId)
        .maybeSingle();

      let createdByName: string | null = null;
      if (row?.created_by) {
        const { data: user } = await supabase
          .from("tab_users")
          .select("full_name")
          .eq("id", row.created_by)
          .maybeSingle();
        createdByName = user?.full_name ?? "Usuario";
      }

      if (!cancelled) {
        setCreation({
          createdAt: row?.created_at ?? null,
          createdByName,
          hasAuthor: !!row?.created_by,
        });
      }
    };

    setCreation(null);
    fetchCreation().catch((err) => console.error("Error fetching creation info:", err));
    return () => { cancelled = true; };
  }, [open, entityType, entityId]);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="h-8 w-8 p-0"
        title="Historial"
      >
        <History className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-2xl"
          onClick={(e) => e.stopPropagation()}
          // Evita que el ESC que cierra el diálogo también cancele la edición de la tarjeta.
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Historial{documentLabel ? ` — ${documentLabel}` : ""}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex items-center gap-2 text-sm">
                <UserPlus className="h-4 w-4 shrink-0" />
                {!creation ? (
                  <span>Cargando autoría...</span>
                ) : creation.hasAuthor ? (
                  <span>
                    Creada por <span className="font-medium text-foreground">{creation.createdByName}</span>
                    {creation.createdAt && (
                      <> el {format(new Date(creation.createdAt), "dd MMM yyyy, HH:mm", { locale: es })}</>
                    )}
                  </span>
                ) : (
                  <span>Autoría no registrada (anterior a la auditoría)</span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <EntityAuditLog entityType={entityType} entityId={entityId} visible={open} />
        </DialogContent>
      </Dialog>
    </>
  );
}

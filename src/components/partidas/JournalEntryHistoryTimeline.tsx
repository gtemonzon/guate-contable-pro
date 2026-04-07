import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, User, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface HistoryEntry {
  id: number;
  changed_at: string;
  changed_by: string | null;
  change_type: string;
  old_header: Record<string, unknown> | null;
  new_header: Record<string, unknown> | null;
  old_details: Record<string, unknown>[] | null;
  new_details: Record<string, unknown>[] | null;
  change_summary: string | null;
  changer_name?: string;
}

interface JournalEntryHistoryTimelineProps {
  entryId: number | null;
  visible: boolean;
}

const HEADER_LABELS: Record<string, string> = {
  entry_number: "No. Partida",
  entry_date: "Fecha",
  entry_type: "Tipo",
  description: "Descripción",
  status: "Estado",
  total_debit: "Total Debe",
  total_credit: "Total Haber",
  bank_reference: "Ref. Bancaria",
  beneficiary_name: "Beneficiario",
  document_reference: "Ref. Documento",
  accounting_period_id: "Período Contable",
  is_posted: "Contabilizado",
  rejection_reason: "Razón de Rechazo",
};

const DETAIL_LABELS: Record<string, string> = {
  line_number: "Línea",
  account_id: "Cuenta",
  debit_amount: "Debe",
  credit_amount: "Haber",
  description: "Descripción",
  cost_center: "Centro de Costo",
  bank_reference: "Ref. Bancaria",
};

const EXCLUDED_FIELDS = new Set([
  "id", "enterprise_id", "created_at", "created_by", "updated_at", "updated_by",
  "posted_at", "reviewed_at", "reviewed_by", "deleted_at", "deleted_by",
  "is_balanced", "currency_id", "exchange_rate", "bank_account_id",
]);

const DETAIL_EXCLUDED = new Set([
  "id", "journal_entry_id", "deleted_at",
]);

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") {
    return new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
  return String(value);
}

function getHeaderDiffs(oldH: Record<string, unknown>, newH: Record<string, unknown>) {
  const diffs: { field: string; label: string; oldVal: string; newVal: string }[] = [];
  const allKeys = new Set([...Object.keys(oldH), ...Object.keys(newH)]);
  for (const key of allKeys) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    const ov = JSON.stringify(oldH[key]);
    const nv = JSON.stringify(newH[key]);
    if (ov !== nv) {
      diffs.push({
        field: key,
        label: HEADER_LABELS[key] || key,
        oldVal: formatValue(oldH[key]),
        newVal: formatValue(newH[key]),
      });
    }
  }
  return diffs;
}

function getDetailDiffs(
  oldDetails: Record<string, unknown>[] | null,
  newDetails: Record<string, unknown>[] | null
) {
  if (!oldDetails && !newDetails) return [];
  // We only have old_details (snapshot before change); new_details may be null
  // For now just show old details as context
  return [];
}

export default function JournalEntryHistoryTimeline({ entryId, visible }: JournalEntryHistoryTimelineProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (visible && entryId) {
      fetchHistory(entryId);
    }
  }, [visible, entryId]);

  const fetchHistory = async (id: number) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_journal_entry_history")
        .select("*")
        .eq("journal_entry_id", id)
        .order("changed_at", { ascending: false });

      if (error) throw error;

      // Fetch user names for changers
      const userIds = [...new Set((data || []).map((h) => h.changed_by).filter(Boolean))];
      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("tab_users")
          .select("id, full_name")
          .in("id", userIds);
        userMap = Object.fromEntries((users || []).map((u) => [u.id, u.full_name]));
      }

      setHistory(
        (data || []).map((h) => ({
          ...h,
          old_header: h.old_header as Record<string, unknown> | null,
          new_header: h.new_header as Record<string, unknown> | null,
          old_details: h.old_details as Record<string, unknown>[] | null,
          new_details: h.new_details as Record<string, unknown>[] | null,
          changer_name: h.changed_by ? userMap[h.changed_by] || "Usuario" : "Sistema",
        }))
      );
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No hay cambios registrados para esta partida.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px] pr-2">
      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

        <div className="space-y-4">
          {history.map((h, idx) => {
            const isOpen = expandedIds.has(h.id);
            const headerDiffs =
              h.old_header && h.new_header ? getHeaderDiffs(h.old_header, h.new_header) : [];

            return (
              <div key={h.id} className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background z-10" />

                <Collapsible open={isOpen} onOpenChange={() => toggleExpanded(h.id)}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full text-left group">
                      <div className="flex items-start justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs shrink-0">
                              {h.change_type}
                            </Badge>
                            <span className="text-sm font-medium truncate">
                              {h.change_summary || "Modificación"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {h.changer_name}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(h.changed_at), "dd/MM/yyyy HH:mm", { locale: es })}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 mt-1">
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="mt-2 ml-1 space-y-2">
                      {headerDiffs.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Encabezado
                          </p>
                          {headerDiffs.map((d) => (
                            <div
                              key={d.field}
                              className="flex items-center gap-2 text-xs rounded-md border p-2"
                            >
                              <span className="font-medium min-w-[120px] shrink-0">{d.label}</span>
                              <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded line-through">
                                {d.oldVal}
                              </span>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="bg-green-500/10 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">
                                {d.newVal}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {h.old_details && h.old_details.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Detalle (antes del cambio)
                          </p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border rounded">
                              <thead>
                                <tr className="bg-muted">
                                  <th className="px-2 py-1 text-left">Línea</th>
                                  <th className="px-2 py-1 text-left">Cuenta</th>
                                  <th className="px-2 py-1 text-right">Debe</th>
                                  <th className="px-2 py-1 text-right">Haber</th>
                                  <th className="px-2 py-1 text-left">Descripción</th>
                                </tr>
                              </thead>
                              <tbody>
                                {h.old_details.map((line, li) => (
                                  <tr key={li} className="border-t">
                                    <td className="px-2 py-1">{String(line.line_number ?? li + 1)}</td>
                                    <td className="px-2 py-1 font-mono">{String(line.account_id ?? "—")}</td>
                                    <td className="px-2 py-1 text-right font-mono">
                                      {formatValue(line.debit_amount)}
                                    </td>
                                    <td className="px-2 py-1 text-right font-mono">
                                      {formatValue(line.credit_amount)}
                                    </td>
                                    <td className="px-2 py-1 text-muted-foreground">
                                      {String(line.description ?? "—")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {headerDiffs.length === 0 && (!h.old_details || h.old_details.length === 0) && (
                        <p className="text-xs text-muted-foreground italic p-2">
                          Sin diferencias detalladas disponibles.
                        </p>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

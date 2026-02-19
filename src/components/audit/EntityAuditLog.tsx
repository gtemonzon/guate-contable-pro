import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Shield, Clock, User, ChevronDown, ChevronRight,
  ArrowRight, CheckCircle2, AlertCircle, Link2,
} from "lucide-react";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────
interface AuditEvent {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_name?: string;
  entity_type: string;
  entity_id: number | null;
  action: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  prev_row_hash: string | null;
  row_hash: string | null;
  chain_valid?: boolean;
}

export interface EntityAuditLogProps {
  /** Table name as stored in audit_event_log.entity_type */
  entityType: string;
  /** Row primary key */
  entityId: number | null;
  /** Whether the tab/panel is currently visible (avoids fetching when hidden) */
  visible?: boolean;
  /** Optional: show hash chain status column */
  showHashChain?: boolean;
}

// ──────────────────────────────────────────────
// Field exclusion (noise columns)
// ──────────────────────────────────────────────
const EXCLUDED_FIELDS = new Set([
  "id", "enterprise_id", "tenant_id",
  "created_at", "created_by", "updated_at", "updated_by",
  "posted_at", "reviewed_at", "reviewed_by",
  "deleted_at", "deleted_by", "read_at",
  "last_activity_at", "current_enterprise_name",
]);

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  INSERT: { label: "Creado",     color: "bg-success/10 text-success border-success/30" },
  UPDATE: { label: "Modificado", color: "bg-primary/10 text-primary border-primary/30" },
  DELETE: { label: "Eliminado",  color: "bg-destructive/10 text-destructive border-destructive/30" },
};

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number")
    return new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  return String(v);
}

function computeDiffs(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): { field: string; oldVal: string; newVal: string }[] {
  if (!before && !after) return [];
  const b = before ?? {};
  const a = after ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const diffs: { field: string; oldVal: string; newVal: string }[] = [];
  for (const k of keys) {
    if (EXCLUDED_FIELDS.has(k)) continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
      diffs.push({ field: k, oldVal: formatVal(b[k]), newVal: formatVal(a[k]) });
    }
  }
  return diffs;
}

function hashShort(hash: string | null): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}…`;
}

// ──────────────────────────────────────────────
// Sub-component: single event row
// ──────────────────────────────────────────────
function AuditEventRow({ event, showHashChain }: { event: AuditEvent; showHashChain: boolean }) {
  const [open, setOpen] = useState(false);
  const cfg = ACTION_CONFIG[event.action] ?? { label: event.action, color: "bg-muted text-muted-foreground border-border" };
  const diffs = computeDiffs(event.before_json, event.after_json);
  const snapshot = event.action === "INSERT" ? event.after_json : event.before_json;

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-6 top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background z-10" />

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left group">
            <div className="flex items-start justify-between gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs shrink-0 ${cfg.color}`}>
                    {cfg.label}
                  </Badge>
                  {showHashChain && (
                    <span
                      className="flex items-center gap-1 text-xs text-muted-foreground font-mono"
                      title={`Hash: ${event.row_hash ?? "—"}`}
                    >
                      {event.chain_valid === false ? (
                        <AlertCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <Link2 className="h-3 w-3 text-muted-foreground" />
                      )}
                      {hashShort(event.row_hash)}
                    </span>
                  )}
                  {diffs.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {diffs.length} campo{diffs.length !== 1 ? "s" : ""} modificado{diffs.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {event.actor_name ?? "Sistema"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(event.created_at), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                  </span>
                </div>
              </div>
              <div className="shrink-0 mt-1">
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-2 ml-1 space-y-3">
            {/* Diffs (UPDATE) */}
            {diffs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cambios</p>
                {diffs.map((d) => (
                  <div key={d.field} className="flex items-center gap-2 text-xs rounded-md border p-2">
                    <span className="font-mono font-medium min-w-[140px] shrink-0 text-muted-foreground">{d.field}</span>
                    {event.action === "UPDATE" ? (
                      <>
                        <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded line-through">{d.oldVal}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="bg-success/10 text-success px-1.5 py-0.5 rounded">{d.newVal}</span>
                      </>
                    ) : event.action === "INSERT" ? (
                      <span className="bg-success/10 text-success px-1.5 py-0.5 rounded">{d.newVal}</span>
                    ) : (
                      <span className="bg-destructive/10 text-destructive px-1.5 py-0.5 rounded line-through">{d.oldVal}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* INSERT snapshot — collapsed by default, shown when no diffs (it's the first event) */}
            {diffs.length === 0 && event.action === "INSERT" && snapshot && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valores iniciales</p>
                <div className="bg-muted rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
                  {Object.entries(snapshot)
                    .filter(([k]) => !EXCLUDED_FIELDS.has(k))
                    .map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="font-mono text-muted-foreground min-w-[140px] shrink-0">{k}</span>
                        <span>{formatVal(v)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Hash chain info */}
            {showHashChain && event.row_hash && (
              <div className="text-xs text-muted-foreground font-mono space-y-0.5 border-t pt-2">
                <div className="flex gap-2"><span className="w-28 shrink-0">prev_hash:</span><span>{hashShort(event.prev_row_hash)}</span></div>
                <div className="flex gap-2"><span className="w-28 shrink-0">row_hash:</span><span>{hashShort(event.row_hash)}</span></div>
                {event.chain_valid === false && (
                  <p className="text-destructive flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    Cadena rota — este registro puede haber sido alterado
                  </p>
                )}
              </div>
            )}

            {diffs.length === 0 && event.action !== "INSERT" && (
              <p className="text-xs text-muted-foreground italic p-2">Sin diferencias detalladas registradas.</p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────
export default function EntityAuditLog({
  entityType,
  entityId,
  visible = true,
  showHashChain = true,
}: EntityAuditLogProps) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainIntact, setChainIntact] = useState<boolean | null>(null);

  useEffect(() => {
    if (visible && entityId) {
      fetchEvents();
    }
  }, [visible, entityId, entityType]);

  const fetchEvents = async () => {
    if (!entityId) return;
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("audit_event_log")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch actor names
      const userIds = [...new Set((data ?? []).map((e) => e.actor_user_id).filter(Boolean))] as string[];
      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from("tab_users")
          .select("id, full_name")
          .in("id", userIds);
        userMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.full_name]));
      }

      const enriched: AuditEvent[] = (data ?? []).map((e) => ({
        ...e,
        before_json: e.before_json as Record<string, unknown> | null,
        after_json:  e.after_json  as Record<string, unknown> | null,
        metadata_json: e.metadata_json as Record<string, unknown> | null,
        actor_name: e.actor_user_id ? (userMap[e.actor_user_id] ?? "Usuario") : "Sistema",
      }));

      // Verify hash chain (client-side quick check)
      // chain is ordered ASC for verification; events are DESC for display
      const asc = [...enriched].reverse();
      let prevHash: string | null = null;
      let allValid = true;
      const validityMap: Record<number, boolean> = {};
      for (const ev of asc) {
        const valid = ev.prev_row_hash === prevHash;
        validityMap[ev.id] = valid;
        if (!valid) allValid = false;
        prevHash = ev.row_hash;
      }

      setChainIntact(enriched.length === 0 ? null : allValid);
      setEvents(enriched.map((e) => ({ ...e, chain_valid: validityMap[e.id] })));
    } catch (err) {
      console.error("Error fetching audit events:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-4 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Empty state ──
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">Sin eventos de auditoría</p>
        <p className="text-xs mt-1 opacity-70">Los cambios a este registro aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Chain integrity banner */}
      {showHashChain && chainIntact !== null && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
          chainIntact
            ? "bg-success/10 border-success/30 text-success"
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          {chainIntact ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span className="font-medium">
            {chainIntact ? "Cadena de hashes íntegra — no se detectaron alteraciones" : "⚠ Cadena rota — posible alteración detectada"}
          </span>
          <span className="ml-auto font-mono opacity-60">{events.length} evento{events.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      <ScrollArea className="h-[420px] pr-2">
        <div className="relative pl-6">
          <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />
          <div className="space-y-4">
            {events.map((ev) => (
              <AuditEventRow key={ev.id} event={ev} showHashChain={showHashChain} />
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

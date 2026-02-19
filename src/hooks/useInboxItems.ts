import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type InboxItemType = "journal_entry" | "bank_movement" | "deadline" | "error" | "pdf";

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  description: string;
  status: "pending" | "error" | "info";
  priority: "urgente" | "importante" | "informativa";
  actionLabel: string;
  actionUrl?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export function useInboxItems(enterpriseId: number | null) {
  return useQuery({
    queryKey: ["inbox-items", enterpriseId],
    queryFn: async (): Promise<InboxItem[]> => {
      if (!enterpriseId) return [];

      const items: InboxItem[] = [];
      const now = new Date();

      // 1) Draft journal entries (partidas en borrador)
      const { data: drafts } = await supabase
        .from("tab_journal_entries")
        .select("id, entry_number, entry_date, description, total_debit, total_credit")
        .eq("enterprise_id", enterpriseId)
        .eq("status", "borrador")
        .order("entry_date", { ascending: false })
        .limit(20);

      (drafts ?? []).forEach((d) => {
        const isUnbalanced =
          Math.abs((d.total_debit ?? 0) - (d.total_credit ?? 0)) > 0.01;
        items.push({
          id: `je-${d.id}`,
          type: "journal_entry",
          title: `Partida ${d.entry_number ?? "S/N"} — Borrador`,
          description: d.description ?? "Sin descripción",
          status: isUnbalanced ? "error" : "pending",
          priority: isUnbalanced ? "urgente" : "importante",
          actionLabel: isUnbalanced ? "Corregir" : "Contabilizar",
          actionUrl: "/partidas",
          meta: {
            entryId: d.id,
            debit: d.total_debit,
            credit: d.total_credit,
            date: d.entry_date,
            unbalanced: isUnbalanced,
            imbalance: Math.abs((d.total_debit ?? 0) - (d.total_credit ?? 0)),
          },
          createdAt: d.entry_date ?? now.toISOString(),
        });
      });

      // 2) Unreconciled bank movements
      const { data: unreconciled } = await supabase
        .from("tab_bank_movements")
        .select("id, movement_date, description, debit_amount, credit_amount, reference")
        .eq("enterprise_id", enterpriseId)
        .eq("is_reconciled", false)
        .order("movement_date", { ascending: false })
        .limit(20);

      (unreconciled ?? []).forEach((m) => {
        const amount = (m.debit_amount ?? 0) + (m.credit_amount ?? 0);
        items.push({
          id: `bm-${m.id}`,
          type: "bank_movement",
          title: `Movimiento bancario sin conciliar`,
          description: m.description ?? m.reference ?? "Sin descripción",
          status: "pending",
          priority: "importante",
          actionLabel: "Conciliar",
          actionUrl: "/conciliacion",
          meta: {
            movementId: m.id,
            date: m.movement_date,
            amount,
            reference: m.reference,
          },
          createdAt: m.movement_date ?? now.toISOString(),
        });
      });

      // 3) Upcoming tax deadlines from notifications
      const { data: deadlines } = await supabase
        .from("tab_notifications")
        .select("id, title, description, event_date, priority, action_url, notification_type")
        .eq("enterprise_id", enterpriseId)
        .eq("is_read", false)
        .in("notification_type", ["tax_deadline", "period_closing", "reminder"])
        .gte("event_date", now.toISOString().split("T")[0])
        .order("event_date", { ascending: true })
        .limit(10);

      (deadlines ?? []).forEach((n) => {
        const eventDate = n.event_date ? new Date(n.event_date) : null;
        const daysUntil = eventDate
          ? Math.ceil((eventDate.getTime() - now.getTime()) / 86_400_000)
          : null;

        items.push({
          id: `notif-${n.id}`,
          type: "deadline",
          title: n.title,
          description:
            n.description ??
            (daysUntil !== null ? `Vence en ${daysUntil} día(s)` : ""),
          status: daysUntil !== null && daysUntil <= 3 ? "error" : "info",
          priority: (n.priority as InboxItem["priority"]) ?? "informativa",
          actionLabel: "Ver detalle",
          actionUrl: n.action_url ?? "/formularios-impuestos",
          meta: { notificationId: n.id, daysUntil, eventDate: n.event_date },
          createdAt: n.event_date ?? now.toISOString(),
        });
      });

      // Sort: urgente first, then importante, then informativa, then by date
      const priorityOrder = { urgente: 0, importante: 1, informativa: 2 };
      items.sort((a, b) => {
        const pd = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pd !== 0) return pd;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return items;
    },
    enabled: !!enterpriseId,
    staleTime: 30_000, // 30 s
  });
}

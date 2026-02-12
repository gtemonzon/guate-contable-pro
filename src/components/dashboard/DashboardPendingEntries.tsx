import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

interface DashboardPendingEntriesProps {
  enterpriseId: number | null;
}

export function DashboardPendingEntries({ enterpriseId }: DashboardPendingEntriesProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-pending-entries", enterpriseId],
    queryFn: async () => {
      if (!enterpriseId) return { pending: 0, draft: 0, rejected: 0 };

      const [pendingRes, draftRes, rejectedRes] = await Promise.all([
        supabase
          .from("tab_journal_entries")
          .select("id", { count: "exact", head: true })
          .eq("enterprise_id", enterpriseId)
          .eq("status", "pendiente")
          .is("deleted_at", null),
        supabase
          .from("tab_journal_entries")
          .select("id", { count: "exact", head: true })
          .eq("enterprise_id", enterpriseId)
          .eq("status", "borrador")
          .is("deleted_at", null),
        supabase
          .from("tab_journal_entries")
          .select("id", { count: "exact", head: true })
          .eq("enterprise_id", enterpriseId)
          .eq("status", "rechazada")
          .is("deleted_at", null),
      ]);

      return {
        pending: pendingRes.count || 0,
        draft: draftRes.count || 0,
        rejected: rejectedRes.count || 0,
      };
    },
    enabled: !!enterpriseId,
    refetchInterval: 5 * 60 * 1000,
  });

  const total = (data?.pending || 0) + (data?.draft || 0) + (data?.rejected || 0);

  const items = [
    { label: "Pendientes de aprobación", count: data?.pending || 0, color: "text-warning", status: "pendiente" },
    { label: "En borrador", count: data?.draft || 0, color: "text-muted-foreground", status: "borrador" },
    { label: "Rechazadas", count: data?.rejected || 0, color: "text-destructive", status: "rechazada" },
  ];

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/partidas")}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Partidas Pendientes</CardTitle>
        <FileText className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <>
            <Skeleton className="h-8 w-16 mb-2" />
            <Skeleton className="h-4 w-full" />
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{total}</div>
            <div className="mt-2 space-y-1">
              {items.filter(i => i.count > 0).map((item) => (
                <div key={item.status} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className={`font-semibold ${item.color}`}>{item.count}</span>
                </div>
              ))}
              {total === 0 && (
                <p className="text-xs text-muted-foreground">Todo al día ✓</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

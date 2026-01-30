import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditLogFilters, AuditLogFiltersState } from "@/components/bitacora/AuditLogFilters";
import { AuditLogTable } from "@/components/bitacora/AuditLogTable";
import { AuditLogDetailDialog } from "@/components/bitacora/AuditLogDetailDialog";
import { Shield } from "lucide-react";

export interface AuditLogEntry {
  id: number;
  enterprise_id: number | null;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: number | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  ip_address: string | null;
  // Joined data
  user_email?: string;
  user_name?: string;
  enterprise_name?: string;
}

// Type guard to ensure JSON is a Record
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const Bitacora = () => {
  const { isSuperAdmin, isTenantAdmin, currentTenant } = useTenant();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [filters, setFilters] = useState<AuditLogFiltersState>({
    dateFrom: null,
    dateTo: null,
    userId: null,
    action: null,
    tableName: null,
    search: "",
  });
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  useEffect(() => {
    fetchLogs();
  }, [filters, page, currentTenant]);

  const fetchLogs = async () => {
    if (!isSuperAdmin && !isTenantAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from("tab_audit_log")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      // Apply filters
      if (filters.dateFrom) {
        query = query.gte("created_at", filters.dateFrom.toISOString());
      }
      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("created_at", endOfDay.toISOString());
      }
      if (filters.userId) {
        query = query.eq("user_id", filters.userId);
      }
      if (filters.action) {
        query = query.eq("action", filters.action);
      }
      if (filters.tableName) {
        query = query.eq("table_name", filters.tableName);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Transform data to match our interface
      const transformedData: AuditLogEntry[] = (data || []).map((item) => ({
        ...item,
        old_values: isRecord(item.old_values) ? item.old_values : null,
        new_values: isRecord(item.new_values) ? item.new_values : null,
      }));

      // Enrich with user and enterprise data
      const enrichedLogs = await enrichLogsWithDetails(transformedData);
      setLogs(enrichedLogs);
      setTotalCount(count || 0);
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const enrichLogsWithDetails = async (logs: AuditLogEntry[]): Promise<AuditLogEntry[]> => {
    const userIds = [...new Set(logs.filter(l => l.user_id).map(l => l.user_id!))];
    const enterpriseIds = [...new Set(logs.filter(l => l.enterprise_id).map(l => l.enterprise_id!))];

    // Fetch users
    let usersMap: Record<string, { email: string; full_name: string }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("tab_users")
        .select("id, email, full_name")
        .in("id", userIds);
      
      if (users) {
        usersMap = users.reduce((acc, u) => {
          acc[u.id] = { email: u.email, full_name: u.full_name };
          return acc;
        }, {} as Record<string, { email: string; full_name: string }>);
      }
    }

    // Fetch enterprises
    let enterprisesMap: Record<number, string> = {};
    if (enterpriseIds.length > 0) {
      const { data: enterprises } = await supabase
        .from("tab_enterprises")
        .select("id, business_name")
        .in("id", enterpriseIds);
      
      if (enterprises) {
        enterprisesMap = enterprises.reduce((acc, e) => {
          acc[e.id] = e.business_name;
          return acc;
        }, {} as Record<number, string>);
      }
    }

    return logs.map(log => ({
      ...log,
      user_email: log.user_id ? usersMap[log.user_id]?.email : undefined,
      user_name: log.user_id ? usersMap[log.user_id]?.full_name : undefined,
      enterprise_name: log.enterprise_id ? enterprisesMap[log.enterprise_id] : undefined,
    }));
  };

  if (!isSuperAdmin && !isTenantAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
        <Shield className="h-16 w-16 mb-4 opacity-50" />
        <h2 className="text-xl font-semibold mb-2">Acceso Restringido</h2>
        <p>Solo los administradores pueden acceder a la bitácora del sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bitácora del Sistema</h1>
        <p className="text-muted-foreground">
          Registro de todas las acciones realizadas en el sistema
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtra los registros de auditoría</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogFilters
            filters={filters}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters);
              setPage(1);
            }}
            isSuperAdmin={isSuperAdmin}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Registros de Auditoría
            {totalCount > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({totalCount} registros)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AuditLogTable
            logs={logs}
            loading={loading}
            onViewDetails={setSelectedLog}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <AuditLogDetailDialog
        log={selectedLog}
        open={!!selectedLog}
        onOpenChange={(open) => !open && setSelectedLog(null)}
      />
    </div>
  );
};

export default Bitacora;
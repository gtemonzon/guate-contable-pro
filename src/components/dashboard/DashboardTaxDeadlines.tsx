import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  computePendingDeadlines,
  parseHolidaysForYears,
  formatDueDate,
  joinLabelsEs,
  DEADLINE_WINDOW_DAYS,
  type TaxDueDateConfig,
  type Holiday,
  type PresentedTaxForm,
  type PendingDeadline,
} from "@/utils/dueDateCalculations";
import { cn } from "@/lib/utils";

interface DashboardTaxDeadlinesProps {
  enterpriseId: number | null;
}

interface DeadlinesData {
  hasConfigs: boolean;
  inWindow: PendingDeadline[];
  next: PendingDeadline[];
}

export function DashboardTaxDeadlines({ enterpriseId }: DashboardTaxDeadlinesProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-tax-deadlines", enterpriseId],
    queryFn: async (): Promise<DeadlinesData> => {
      if (!enterpriseId) return { hasConfigs: false, inWindow: [], next: [] };

      const [configRes, holidaysRes, presentedRes] = await Promise.all([
        supabase
          .from("tab_tax_due_date_config")
          .select("*")
          .eq("enterprise_id", enterpriseId)
          .eq("is_active", true),
        supabase
          .from("tab_holidays")
          .select("holiday_date, description, is_recurring")
          .eq("enterprise_id", enterpriseId),
        supabase
          .from("tab_tax_forms")
          .select("tax_type, period_month, period_year, period_type")
          .eq("enterprise_id", enterpriseId)
          .eq("is_active", true),
      ]);

      const today = new Date();
      const configs: TaxDueDateConfig[] = (configRes.data || []).map((cfg) => ({
        tax_type: cfg.tax_type,
        tax_label: cfg.tax_label,
        calculation_type: cfg.calculation_type as TaxDueDateConfig["calculation_type"],
        days_value: cfg.days_value || 0,
        reference_period: cfg.reference_period as TaxDueDateConfig["reference_period"],
        consider_holidays: cfg.consider_holidays ?? true,
        is_active: true,
      }));
      // Feriados del año anterior, actual y siguiente (los vencimientos de enero
      // del año siguiente también respetan los recurrentes).
      const holidays = parseHolidaysForYears((holidaysRes.data || []) as Holiday[], today.getFullYear());
      const forms = (presentedRes.data || []) as PresentedTaxForm[];

      const { inWindow, next } = computePendingDeadlines({ configs, holidays, forms, today });
      return { hasConfigs: configs.length > 0, inWindow, next };
    },
    enabled: !!enterpriseId,
    refetchInterval: 5 * 60 * 1000,
  });

  // Siguiente vencimiento fuera de la ventana: todos los impuestos con la fecha más cercana.
  const nextGroup = (() => {
    const first = data?.next[0];
    if (!first) return null;
    const sameDay = data.next.filter((d) => d.dueDate.getTime() === first.dueDate.getTime());
    return {
      labels: joinLabelsEs(sameDay.map((d) => d.label)),
      dateStr: formatDueDate(first.dueDate),
      daysUntil: first.daysUntil,
    };
  })();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/generar-declaracion")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Próximos Vencimientos</CardTitle>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : data && data.inWindow.length > 0 ? (
          <div className="space-y-2">
            {data.inWindow.slice(0, 5).map((deadline) => (
              <div
                key={`${deadline.taxType}-${formatDueDate(deadline.dueDate)}`}
                title={`Período: ${deadline.periodLabel}`}
                className={cn(
                  "flex items-center justify-between text-xs p-1.5 rounded",
                  deadline.isOverdue && "bg-destructive/10",
                  deadline.isUrgent && !deadline.isOverdue && "bg-warning/10",
                )}
              >
                <div className="flex items-center gap-1.5 truncate mr-2">
                  {(deadline.isOverdue || deadline.isUrgent) && (
                    <AlertTriangle className={cn(
                      "h-3 w-3 shrink-0",
                      deadline.isOverdue ? "text-destructive" : "text-warning"
                    )} />
                  )}
                  <span className="truncate">{deadline.label}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-muted-foreground">{formatDueDate(deadline.dueDate)}</span>
                  <span className={cn(
                    "font-semibold min-w-[3rem] text-right",
                    deadline.isOverdue ? "text-destructive" : 
                    deadline.isUrgent ? "text-warning" :
                    deadline.isImportant ? "text-primary" : "text-muted-foreground"
                  )}>
                    {deadline.isOverdue
                      ? `${Math.abs(deadline.daysUntil)}d atrás`
                      : `${deadline.daysUntil}d`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : data?.hasConfigs ? (
          <div className="py-3 text-center space-y-1">
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Sin vencimientos en los próximos {DEADLINE_WINDOW_DAYS} días
            </p>
            {nextGroup && (
              <p className="text-[11px] text-muted-foreground">
                Siguiente: {nextGroup.labels} — {nextGroup.dateStr} ({nextGroup.daysUntil} d)
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Sin impuestos configurados
          </p>
        )}
      </CardContent>
    </Card>
  );
}

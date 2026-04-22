import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, AlertTriangle, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  calculateDueDate,
  parseHolidays,
  getDaysUntil,
  formatDueDate,
  getReferenceDate,
  type TaxDueDateConfig,
  type Holiday,
} from "@/utils/dueDateCalculations";
import { subDays, getMonth, getYear } from "date-fns";
import { cn } from "@/lib/utils";

const TAX_TYPE_MATCHERS: Record<string, string[]> = {
  iva: ['iva'],
  iva_mensual: ['iva'],
  isr_mensual: ['isr'],
  isr_trimestral: ['isr'],
  iso: ['iso'],
  iso_trimestral: ['iso'],
  retencion_iva: ['ret', 'iva'],
  retenciones_iva: ['ret', 'iva'],
  retencion_isr: ['ret', 'isr'],
  retenciones_isr: ['ret', 'isr'],
  isr_anual: ['isr', 'anual'],
};

function taxFormMatchesType(formTaxType: string | null | undefined, configTaxType: string): boolean {
  if (!formTaxType) return false;
  const normalized = formTaxType.toLowerCase().trim();
  const matchers = TAX_TYPE_MATCHERS[configTaxType] ?? [configTaxType.toLowerCase()];
  if (matchers.length === 1) return normalized.includes(matchers[0]);
  return matchers.every((token) => normalized.includes(token));
}

interface DashboardTaxDeadlinesProps {
  enterpriseId: number | null;
}

export function DashboardTaxDeadlines({ enterpriseId }: DashboardTaxDeadlinesProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-tax-deadlines", enterpriseId],
    queryFn: async () => {
      if (!enterpriseId) return [];

      const [configRes, holidaysRes] = await Promise.all([
        supabase
          .from("tab_tax_due_date_config")
          .select("*")
          .eq("enterprise_id", enterpriseId)
          .eq("is_active", true),
        supabase
          .from("tab_holidays")
          .select("holiday_date, description, is_recurring")
          .eq("enterprise_id", enterpriseId),
      ]);

      const configs = (configRes.data || []) as any[];
      const holidays = parseHolidays(
        (holidaysRes.data || []) as Holiday[],
        new Date().getFullYear()
      );

      const now = new Date();
      const currentPeriod = new Date(now.getFullYear(), now.getMonth(), 1);

      const deadlines = configs.map((cfg) => {
        const config: TaxDueDateConfig = {
          tax_type: cfg.tax_type,
          tax_label: cfg.tax_label,
          calculation_type: cfg.calculation_type,
          days_value: cfg.days_value || 0,
          reference_period: cfg.reference_period,
          consider_holidays: cfg.consider_holidays ?? true,
          is_active: true,
        };

        const dueDate = calculateDueDate(currentPeriod, config, holidays);
        const daysUntil = getDaysUntil(dueDate);

        return {
          label: cfg.tax_label,
          dueDate,
          dueDateStr: formatDueDate(dueDate),
          daysUntil,
          isOverdue: daysUntil < 0,
          isUrgent: daysUntil >= 0 && daysUntil <= 3,
          isImportant: daysUntil > 3 && daysUntil <= 7,
        };
      });

      // Sort by due date ascending
      return deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    },
    enabled: !!enterpriseId,
    refetchInterval: 5 * 60 * 1000,
  });

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
        ) : data && data.length > 0 ? (
          <div className="space-y-2">
            {data.slice(0, 5).map((deadline, idx) => (
              <div
                key={idx}
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
                  <span className="text-muted-foreground">{deadline.dueDateStr}</span>
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
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Sin impuestos configurados
          </p>
        )}
      </CardContent>
    </Card>
  );
}

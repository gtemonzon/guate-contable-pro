import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import type { ISRTrimestralData } from "@/hooks/useDashboardTaxData";
import { MONTH_NAMES_ES, formatDueDate } from "@/utils/dueDateCalculations";
import { cn } from "@/lib/utils";

interface DashboardISRTrimestralProps {
  data: ISRTrimestralData | null;
  loading: boolean;
}

const formatNumber = (num: number): string =>
  num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "dd/MM/yyyy HH:mm" en hora local. */
const formatSavedAt = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 'YYYY-MM-DD' → 'dd/MM/yyyy'. */
const formatDateOnly = (value: string): string => {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** "Julio - Septiembre". */
const quarterMonthsLong = (startMonth: number): string =>
  `${MONTH_NAMES_ES[startMonth]} - ${MONTH_NAMES_ES[startMonth + 2]}`;

function Row({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold financial-number", className)}>Q {formatNumber(value)}</span>
    </div>
  );
}

/** "Vence dd/MM/yyyy (N d)" o "Venció hace N d". */
function DueLine({ data }: { data: ISRTrimestralData }) {
  if (!data.dueDate || data.daysUntil === null) return null;
  if (data.isOverdue) {
    return (
      <p className="text-xs font-medium text-destructive">
        Venció hace {Math.abs(data.daysUntil)} d ({formatDueDate(data.dueDate)})
      </p>
    );
  }
  return (
    <p className="text-xs text-muted-foreground">
      Vence {formatDueDate(data.dueDate)} ({data.daysUntil} d)
    </p>
  );
}

/**
 * ISR Trimestral (SAT-1341): el trimestre pendiente de declarar con el cálculo guardado
 * del Generador de Declaraciones (acumulado del año menos el ISR ya pagado), o el
 * formulario ya presentado.
 */
export function DashboardISRTrimestral({ data, loading }: DashboardISRTrimestralProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/generar-declaracion")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">ISR Trimestral</CardTitle>
            {data && (
              <CardDescription>
                T{data.quarter} {data.year} ({quarterMonthsLong(data.quarterStartMonth)})
              </CardDescription>
            )}
          </div>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Sin datos</p>
        ) : data.state === "presented" && data.presentedForm ? (
          <p className="text-sm text-muted-foreground">
            Presentado: formulario {data.presentedForm.formNumber} — Q{formatNumber(data.presentedForm.amountPaid)}
            {data.presentedForm.paymentDate ? ` el ${formatDateOnly(data.presentedForm.paymentDate)}` : ""}
          </p>
        ) : data.hasSaved ? (
          <div className="space-y-2 text-sm">
            <Row label="Ingresos (acumulado)" value={data.ingresos} />
            <Row label="Costo de ventas" value={data.costoVentas} />
            <Row label="Gastos de operación" value={data.gastosOperacion} />
            <div className="pt-2 border-t">
              <Row label="Renta imponible" value={data.rentaImponible} />
              {data.rentaImponible < 0 && (
                <p className="text-xs text-muted-foreground">Pérdida acumulada del año</p>
              )}
            </div>
            <Row
              label={`ISR calculado (${data.rate.toLocaleString("es-GT", { maximumFractionDigits: 2 })}%)`}
              value={data.isrCalculado}
            />
            {data.isrPagadoAnterior > 0 && (
              <Row label="ISR pagado en trimestres anteriores" value={data.isrPagadoAnterior} />
            )}
            <div className="flex justify-between pt-2 border-t">
              <span className="font-medium">ISR a Pagar</span>
              <span className={cn("font-bold financial-number", data.isrAPagar > 0 && "text-destructive")}>
                Q {formatNumber(data.isrAPagar)}
              </span>
            </div>
            <DueLine data={data} />
            {data.savedAt && (
              <p className="text-[10px] text-muted-foreground leading-tight pt-1">
                Según cálculo del {formatSavedAt(data.savedAt)}. No refleja cambios posteriores en la contabilidad;
                vuelve a generarlo si los hubo.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              No hay cálculo del trimestre {quarterMonthsLong(data.quarterStartMonth)} {data.year}. Genéralo en el
              Generador de Declaraciones.
            </p>
            <DueLine data={data} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

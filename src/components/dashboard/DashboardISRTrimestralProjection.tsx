import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import type { ISRTrimestralData } from "@/hooks/useDashboardTaxData";

interface DashboardISRTrimestralProjectionProps {
  data: ISRTrimestralData | null;
  loading: boolean;
}

const formatNumber = (num: number): string =>
  num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardISRTrimestralProjection({ data, loading }: DashboardISRTrimestralProjectionProps) {
  const navigate = useNavigate();
  const now = new Date();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/generar-declaracion")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Proyección ISR Trimestral</CardTitle>
            {data && (
              <CardDescription>
                Q{data.currentQuarter} {now.getFullYear()} ({data.quarterLabel})
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
        ) : data ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ventas acumuladas</span>
              <span className="font-semibold financial-number">Q {formatNumber(data.projectedSales)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Costos/Gastos</span>
              <span className="font-semibold financial-number">Q {formatNumber(data.projectedCosts)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-muted-foreground">Utilidad proyectada</span>
              <span className="font-semibold financial-number">Q {formatNumber(data.projectedProfit)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="font-medium">ISR estimado (25%)</span>
              <span className="font-bold financial-number text-destructive">
                Q {formatNumber(data.isrEstimado)}
              </span>
            </div>
            <div className="pt-2 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Basado en {data.completedMonths} de 3 meses • Proyección</span>
              </div>
              <Progress value={(data.completedMonths / 3) * 100} className="h-1.5" />
            </div>
            {data.usesCoefficient && (
              <p className="text-xs text-muted-foreground italic">
                Costo de ventas estimado por coeficiente
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Datos insuficientes para proyectar</p>
        )}
      </CardContent>
    </Card>
  );
}

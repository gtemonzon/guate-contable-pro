import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import type { ISRMensualData } from "@/hooks/useDashboardTaxData";

interface DashboardISRMensualSummaryProps {
  data: ISRMensualData | null;
  loading: boolean;
  monthName: string;
  year: number;
}

const formatNumber = (num: number): string =>
  num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardISRMensualSummary({ data, loading, monthName, year }: DashboardISRMensualSummaryProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/generar-declaracion")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">ISR Mensual</CardTitle>
            <CardDescription className="capitalize">{monthName} {year}</CardDescription>
          </div>
          <Receipt className="h-4 w-4 text-muted-foreground" />
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
              <span className="text-muted-foreground">Ingresos Netos</span>
              <span className="font-semibold financial-number">Q {formatNumber(data.ingresosBrutos)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground pl-2">Primer tramo (5%)</span>
              <span className="financial-number">Q {formatNumber(data.primerTramo)}</span>
            </div>
            {data.segundoTramo > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground pl-2">Segundo tramo (7%)</span>
                <span className="financial-number">Q {formatNumber(data.segundoTramo)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t">
              <span className="font-medium">ISR a Pagar</span>
              <span className="font-bold financial-number text-destructive">
                Q {formatNumber(data.isrCalculado)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>{data.salesCount} documentos</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin datos</p>
        )}
      </CardContent>
    </Card>
  );
}

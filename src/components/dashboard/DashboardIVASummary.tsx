import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import type { IVAData } from "@/hooks/useDashboardTaxData";

interface DashboardIVASummaryProps {
  ivaData: IVAData | null;
  loading: boolean;
  monthName: string;
  year: number;
}

const formatNumber = (num: number): string =>
  num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardIVASummary({ ivaData, loading, monthName, year }: DashboardIVASummaryProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/libros-fiscales")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">
              {ivaData?.regime === 'pequeno' ? 'IVA Pequeño Contribuyente' : 'Resumen IVA del Mes'}
            </CardTitle>
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
        ) : ivaData ? (
          ivaData.regime === 'general' ? (
            // IVA General layout
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA Débito (Ventas)</span>
                <span className="font-semibold text-success financial-number">Q {formatNumber(ivaData.salesVat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA Crédito (Compras)</span>
                <span className="font-semibold text-destructive financial-number">Q {formatNumber(ivaData.purchasesVat)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="font-medium">IVA por Pagar</span>
                <span className={`font-bold financial-number ${ivaData.ivaBalance >= 0 ? "text-destructive" : "text-success"}`}>
                  Q {formatNumber(Math.abs(ivaData.ivaBalance))}
                  {ivaData.ivaBalance < 0 && <span className="text-xs ml-1">(crédito)</span>}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>{ivaData.salesCount} ventas / {ivaData.purchasesCount} compras</span>
              </div>
            </div>
          ) : (
            // IVA Pequeño Contribuyente layout
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ingresos del Mes</span>
                <span className="font-semibold financial-number">Q {formatNumber(ivaData.totalIngresos)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="font-medium">Impuesto (5%)</span>
                <span className="font-bold text-destructive financial-number">
                  Q {formatNumber(ivaData.impuestoPequeno)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>{ivaData.salesCount} documentos</span>
              </div>
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            No se pudo determinar el régimen de IVA. Verifica la pestaña Impuestos en la configuración de la empresa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

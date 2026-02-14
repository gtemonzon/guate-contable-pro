import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import type { TaxSummaryItem } from "@/hooks/useDashboardTaxData";

interface DashboardTaxSummaryProps {
  taxSummary: TaxSummaryItem[];
  totalTaxEstimate: number;
  loading: boolean;
}

const formatNumber = (num: number): string =>
  num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardTaxSummary({ taxSummary, totalTaxEstimate, loading }: DashboardTaxSummaryProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/generar-declaracion")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Resumen de Impuestos</CardTitle>
            <CardDescription>Pendientes de pago</CardDescription>
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
        ) : taxSummary.length > 0 ? (
          <div className="space-y-2 text-sm">
            {taxSummary.map((item, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="text-muted-foreground truncate mr-2">{item.label}</span>
                <span className={`font-semibold financial-number shrink-0 ${item.amount <= 0 ? "text-success" : ""}`}>
                  Q {formatNumber(Math.abs(item.amount))}
                  {item.amount < 0 && <span className="text-xs ml-1">(crédito)</span>}
                </span>
              </div>
            ))}
            {taxSummary.length > 1 && (
              <>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total estimado</span>
                  <span className="financial-number">Q {formatNumber(totalTaxEstimate)}</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin impuestos configurados</p>
        )}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, CheckCircle2 } from "lucide-react";
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
  Math.round(num).toLocaleString("es-GT", { maximumFractionDigits: 0 });

/** 'YYYY-MM-DD' → 'dd/MM/yyyy'. */
const formatDateOnly = (value: string | null): string => {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};


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
              item.presented ? (
                // Ya presentado: atenuado, con lo pagado; no cuenta en el total.
                <div
                  key={idx}
                  className="flex justify-between text-muted-foreground opacity-70"
                  title={`Formulario ${item.presented.formNumber}${item.presented.paymentDate ? ` — ${formatDateOnly(item.presented.paymentDate)}` : ""}`}
                >
                  <span className="truncate mr-2">{item.label}</span>
                  <span className="flex items-center gap-1 financial-number shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Presentado Q {formatNumber(item.presented.amountPaid)}
                  </span>
                </div>
              ) : (
                <div key={idx} className="flex justify-between">
                  <span className="text-muted-foreground truncate mr-2">{item.label}</span>
                  <span className={`font-semibold financial-number shrink-0 ${item.amount <= 0 ? "text-success" : ""}`}>
                    Q {formatNumber(Math.abs(item.amount))}
                    {item.amount < 0 && <span className="text-xs ml-1">(crédito)</span>}
                  </span>
                </div>
              )
            ))}
            {taxSummary.every((item) => item.presented) ? (
              <>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span className="text-success">Todo presentado ✓</span>
                  <span className="financial-number">Q 0</span>
                </div>
              </>
            ) : taxSummary.length > 1 && (
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

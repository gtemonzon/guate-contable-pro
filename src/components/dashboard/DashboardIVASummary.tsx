import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

interface DashboardIVASummaryProps {
  enterpriseId: number | null;
}

const formatNumber = (num: number): string =>
  num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function DashboardIVASummary({ enterpriseId }: DashboardIVASummaryProps) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-iva-summary", enterpriseId],
    queryFn: async () => {
      if (!enterpriseId) return null;

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;

      const [salesRes, purchasesRes] = await Promise.all([
        supabase
          .from("tab_sales_ledger")
          .select("vat_amount, net_amount, total_amount")
          .eq("enterprise_id", enterpriseId)
          .eq("is_annulled", false)
          .is("deleted_at", null)
          .gte("invoice_date", monthStart)
          .lte("invoice_date", monthEnd),
        supabase
          .from("tab_purchase_ledger")
          .select("vat_amount, net_amount, total_amount")
          .eq("enterprise_id", enterpriseId)
          .is("deleted_at", null)
          .gte("invoice_date", monthStart)
          .lte("invoice_date", monthEnd),
      ]);

      const salesVat = (salesRes.data || []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
      const salesTotal = (salesRes.data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const purchasesVat = (purchasesRes.data || []).reduce((s, r) => s + Number(r.vat_amount || 0), 0);
      const purchasesTotal = (purchasesRes.data || []).reduce((s, r) => s + Number(r.total_amount || 0), 0);

      return {
        salesVat,
        salesTotal,
        salesCount: salesRes.data?.length || 0,
        purchasesVat,
        purchasesTotal,
        purchasesCount: purchasesRes.data?.length || 0,
        ivaBalance: salesVat - purchasesVat,
      };
    },
    enabled: !!enterpriseId,
    refetchInterval: 5 * 60 * 1000,
  });

  const monthName = new Date().toLocaleString("es-GT", { month: "long" });

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/libros-fiscales")}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Resumen IVA del Mes</CardTitle>
            <CardDescription className="capitalize">{monthName} {new Date().getFullYear()}</CardDescription>
          </div>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA Débito (Ventas)</span>
              <span className="font-semibold text-success financial-number">Q {formatNumber(data.salesVat)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA Crédito (Compras)</span>
              <span className="font-semibold text-destructive financial-number">Q {formatNumber(data.purchasesVat)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="font-medium">IVA por Pagar</span>
              <span className={`font-bold financial-number ${data.ivaBalance >= 0 ? "text-destructive" : "text-success"}`}>
                Q {formatNumber(Math.abs(data.ivaBalance))}
                {data.ivaBalance < 0 && <span className="text-xs ml-1">(crédito)</span>}
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground pt-1">
              <span>{data.salesCount} ventas / {data.purchasesCount} compras</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sin datos</p>
        )}
      </CardContent>
    </Card>
  );
}

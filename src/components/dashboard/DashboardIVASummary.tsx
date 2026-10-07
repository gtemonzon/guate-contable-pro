import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, AlertTriangle } from "lucide-react";
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
  Math.round(num).toLocaleString("es-GT", { maximumFractionDigits: 0 });

/** "dd/MM/yyyy HH:mm" en hora local. */
const formatSavedAt = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Pie: de dónde salen los números y si los libros cambiaron desde el cálculo guardado. */
function SourceFooter({ ivaData }: { ivaData: IVAData }) {
  if (ivaData.source === "saved" && ivaData.savedAt) {
    return (
      <div className="space-y-1 pt-1">
        <p className="text-[10px] text-muted-foreground leading-tight">
          Según cálculo del {formatSavedAt(ivaData.savedAt)}
        </p>
        {ivaData.stale && (
          <p className="flex items-start gap-1 text-[10px] leading-tight text-warning">
            <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
            Los libros cambiaron desde ese cálculo. Vuelve a generarlo.
          </p>
        )}
      </div>
    );
  }
  return (
    <p className="text-[10px] text-muted-foreground leading-tight pt-1">
      {ivaData.regime === "general" && ivaData.carryoverIn > 0
        ? `Estimación basada en libros y en el remanente contable (Q ${formatNumber(ivaData.carryoverIn)}). No incluye ajustes manuales del Generador de Declaraciones.`
        : "Estimación basada en libros. No incluye remanente ni ajustes manuales del Generador de Declaraciones."}
    </p>
  );
}


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
                <span className="font-semibold text-success financial-number">Q {formatNumber(ivaData.debit)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA Crédito (Compras)</span>
                <span className="font-semibold text-destructive financial-number">Q {formatNumber(ivaData.credit)}</span>
              </div>
              {ivaData.carryoverIn > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Remanente mes anterior</span>
                  <span className="financial-number">Q {formatNumber(ivaData.carryoverIn)}</span>
                </div>
              )}
              {ivaData.exemption > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exención IVA</span>
                  <span className="financial-number">Q {formatNumber(ivaData.exemption)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                {ivaData.ivaToPay <= 0 && ivaData.carryoverOut > 0 ? (
                  <>
                    <span className="font-medium">Crédito para el mes siguiente</span>
                    <span className="font-bold financial-number text-success">
                      Q {formatNumber(ivaData.carryoverOut)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">IVA por Pagar</span>
                    <span className="font-bold financial-number text-destructive">
                      Q {formatNumber(ivaData.ivaToPay)}
                    </span>
                  </>
                )}
              </div>

              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>{ivaData.salesCount} ventas / {ivaData.purchasesCount} compras</span>
              </div>
              <SourceFooter ivaData={ivaData} />

            </div>
          ) : (
            // IVA Pequeño Contribuyente layout
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ingresos del Mes</span>
                <span className="font-semibold financial-number">Q {formatNumber(ivaData.ingresos)}</span>
              </div>
              {ivaData.retention > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retención IVA</span>
                  <span className="financial-number">Q {formatNumber(ivaData.retention)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t">
                <span className="font-medium">Impuesto ({ivaData.rate.toLocaleString("es-GT", { maximumFractionDigits: 2 })}%)</span>
                <span className="font-bold text-destructive financial-number">
                  Q {formatNumber(ivaData.impuestoPequeno)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pt-1">
                <span>{ivaData.salesCount} documentos</span>
              </div>
              <SourceFooter ivaData={ivaData} />
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

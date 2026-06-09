import { Info, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { EstimatedCogsResult } from '@/hooks/useEstimatedCogs';

interface Props {
  data: EstimatedCogsResult;
}

const formatQ = (amount: number) =>
  `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function EstimatedCogsBlock({ data }: Props) {
  if (!data.enabled) return null;

  // If we can't show numbers, show a softer hint
  if (data.estimatedCostOfSales === null || data.historicalPercentage === null) {
    return (
      <div className="mt-6 pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-4 w-4 text-sky-500" />
          <h4 className="font-bold text-sm">COSTO DE VENTAS ESTIMADO (proyección)</h4>
          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800">
            Estimado
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground italic">
          {data.reason || 'No fue posible calcular la proyección del costo de ventas para este período.'}
        </p>
      </div>
    );
  }

  const percentLabel = `${(data.historicalPercentage * 100).toFixed(2)}%`;
  const basisLabel =
    data.method === 'last_period'
      ? 'último período cerrado'
      : `promedio de los últimos ${data.basisPeriodsUsed} período${data.basisPeriodsUsed === 1 ? '' : 's'} cerrado${data.basisPeriodsUsed === 1 ? '' : 's'}`;

  return (
    <div className="mt-6 pt-4 border-t border-dashed border-sky-300 dark:border-sky-800">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-sky-500" />
        <h4 className="font-bold text-sm">COSTO DE VENTAS ESTIMADO (proyección)</h4>
        <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800">
          Estimado
        </Badge>
      </div>

      <div className="space-y-1 font-mono text-sm bg-sky-50/50 dark:bg-sky-950/20 rounded-md p-3 border border-sky-200/60 dark:border-sky-900/60">
        <div className="grid grid-cols-2 gap-4 py-1 pl-2 text-muted-foreground">
          <div>Ventas Netas del Período</div>
          <div className="text-right">{formatQ(data.currentSales)}</div>
        </div>
        <div className="grid grid-cols-2 gap-4 py-1 pl-2 text-muted-foreground">
          <div>× % Histórico de Costo de Ventas</div>
          <div className="text-right">{percentLabel}</div>
        </div>
        <div className="grid grid-cols-2 gap-4 py-1 pl-2 font-semibold">
          <div>Costo de Ventas Estimado</div>
          <div className="text-right text-sky-700 dark:text-sky-300">{formatQ(data.estimatedCostOfSales)}</div>
        </div>
        <div className="grid grid-cols-2 gap-4 py-1 pl-2 border-t border-sky-200 dark:border-sky-900 font-bold">
          <div>Margen Bruto Estimado</div>
          <div className="text-right text-sky-700 dark:text-sky-300">{formatQ(data.estimatedGrossProfit ?? 0)}</div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-2 italic flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-500" />
        <span>
          Valores estimados con base en el {basisLabel} ({percentLabel}). Son únicamente para análisis gerencial y
          <strong> no reemplazan</strong> el costo de ventas oficial generado durante el cierre del período. No afectan
          el Balance General, el Mayor ni los saldos contables.
        </span>
      </p>
    </div>
  );
}

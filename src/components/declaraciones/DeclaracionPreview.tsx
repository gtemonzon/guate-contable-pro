import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Info } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { IVAGeneralCalculo, IVAPequenoCalculo, ISRMensualCalculo, TaxFormType } from "@/hooks/useDeclaracionCalculo";

interface DeclaracionPreviewProps {
  formType: TaxFormType;
  ivaGeneral?: IVAGeneralCalculo;
  ivaPequeno?: IVAPequenoCalculo;
  isrMensual?: ISRMensualCalculo;
  month: number;
  year: number;
  creditoRemanente?: number;
  onCreditoRemanenteChange?: (value: number) => void;
  creditoRemanenteSugerido?: number;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("es-GT", {
    style: "currency",
    currency: "GTQ",
  }).format(value);
};

function CopyButton({ value }: { value: number }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value.toFixed(2));
    setCopied(true);
    toast({ title: "Copiado", description: `${formatCurrency(value)} copiado al portapapeles` });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function CasillaRow({ casilla, label, value }: { casilla: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-muted-foreground w-8">{casilla}</span>
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono font-medium">{formatCurrency(value)}</span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function TotalRow({ label, value, isHighlight = false }: { label: string; value: number; isHighlight?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-3 ${isHighlight ? 'bg-primary/10 px-3 rounded-lg' : ''}`}>
      <span className={`font-semibold ${isHighlight ? 'text-primary' : ''}`}>{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-mono font-bold text-lg ${isHighlight ? 'text-primary' : ''}`}>
          {formatCurrency(value)}
        </span>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function DeclaracionPreview({ 
  formType, 
  ivaGeneral, 
  ivaPequeno, 
  isrMensual, 
  month, 
  year,
  creditoRemanente = 0,
  onCreditoRemanenteChange,
  creditoRemanenteSugerido = 0
}: DeclaracionPreviewProps) {
  const { toast } = useToast();
  const periodLabel = `${MONTHS[month - 1]} ${year}`;

  if (formType === 'IVA_GENERAL' && ivaGeneral) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>SAT-2237 IVA Régimen General</span>
            <span className="text-sm font-normal text-muted-foreground">Período: {periodLabel}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Ventas */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Ventas</h4>
            <div className="bg-muted/30 rounded-lg p-3">
              <CasillaRow casilla="14" label="Ventas Gravadas Locales" value={ivaGeneral.ventasGravadasLocales} />
              <CasillaRow casilla="15" label="Exportaciones" value={ivaGeneral.exportaciones} />
              <CasillaRow casilla="17" label="Ventas Exentas" value={ivaGeneral.ventasExentas} />
              <CasillaRow casilla="19" label="Total Ventas" value={ivaGeneral.totalVentas} />
            </div>
          </div>

          {/* Débito Fiscal */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Débito Fiscal</h4>
            <div className="bg-muted/30 rounded-lg p-3">
              <CasillaRow casilla="26" label="Débito Fiscal del Período" value={ivaGeneral.debitoFiscal} />
            </div>
          </div>

          {/* Crédito Fiscal */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Crédito Fiscal</h4>
            <div className="bg-muted/30 rounded-lg p-3">
              <CasillaRow casilla="30" label="Compras Gravadas" value={ivaGeneral.comprasGravadas} />
              <CasillaRow casilla="34" label="Crédito Fiscal del Período" value={ivaGeneral.creditoFiscal} />
            </div>
          </div>

          {/* Resultado */}
          <div className="pt-4 border-t space-y-3">
            <CasillaRow casilla="40" label="Diferencia (Débito - Crédito)" value={ivaGeneral.diferencia} />
            
            {/* Casilla 38 - Crédito Remanente Editable */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-8">38</span>
                <span className="text-sm">Crédito Remanente del Mes Anterior</span>
                {creditoRemanenteSugerido > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 px-2 text-xs gap-1"
                          onClick={() => {
                            onCreditoRemanenteChange?.(creditoRemanenteSugerido);
                            toast({ 
                              title: "Sugerencia aplicada", 
                              description: `Se aplicó el crédito remanente sugerido de ${formatCurrency(creditoRemanenteSugerido)}` 
                            });
                          }}
                        >
                          <Info className="h-3 w-3" />
                          Sugerido: {formatCurrency(creditoRemanenteSugerido)}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Calculado del mes anterior: si el crédito fiscal fue mayor que el débito fiscal</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={creditoRemanente}
                  onChange={(e) => onCreditoRemanenteChange?.(parseFloat(e.target.value) || 0)}
                  className="w-32 text-right font-mono h-8"
                  placeholder="0.00"
                />
                <CopyButton value={creditoRemanente} />
              </div>
            </div>
            
            <TotalRow label="IVA A PAGAR (Casilla 42)" value={ivaGeneral.ivaAPagar} isHighlight />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (formType === 'IVA_PEQUENO' && ivaPequeno) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>SAT-2046 IVA Pequeño Contribuyente</span>
            <span className="text-sm font-normal text-muted-foreground">Período: {periodLabel}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/30 rounded-lg p-3">
            <CasillaRow casilla="21" label="Total Ingresos del Mes" value={ivaPequeno.totalIngresos} />
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-muted-foreground w-8">23</span>
                <span className="text-sm">Tasa de Impuesto</span>
              </div>
              <span className="font-mono font-medium">{ivaPequeno.tasaImpuesto}%</span>
            </div>
          </div>

          <div className="pt-4 border-t">
            <TotalRow label="IMPUESTO A PAGAR (Casilla 24)" value={ivaPequeno.impuestoAPagar} isHighlight />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (formType === 'ISR_MENSUAL' && isrMensual) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>SAT-1311 ISR Opción Mensual</span>
            <span className="text-sm font-normal text-muted-foreground">Período: {periodLabel}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/30 rounded-lg p-3">
            <CasillaRow casilla="" label="Ingresos Brutos del Mes" value={isrMensual.ingresosBrutos} />
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Tasa ISR</span>
              <span className="font-mono font-medium">{isrMensual.tasaISR}%</span>
            </div>
          </div>

          <div className="pt-4 border-t">
            <TotalRow label="ISR A PAGAR" value={isrMensual.isrAPagar} isHighlight />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-8 text-center text-muted-foreground">
        Selecciona un tipo de formulario y genera el cálculo
      </CardContent>
    </Card>
  );
}

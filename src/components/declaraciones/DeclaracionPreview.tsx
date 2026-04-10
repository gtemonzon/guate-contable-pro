import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, Info } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ISOCalculo, IVAGeneralCalculo, IVAPequenoCalculo, ISRMensualCalculo, TaxFormType } from "@/hooks/useDeclaracionCalculo";

interface DeclaracionPreviewProps {
  formType: TaxFormType;
  ivaGeneral?: IVAGeneralCalculo;
  ivaPequeno?: IVAPequenoCalculo;
  isrMensual?: ISRMensualCalculo;
  isoCalculo?: ISOCalculo;
  month: number;
  year: number;
  creditoRemanente?: number;
  onCreditoRemanenteChange?: (value: number) => void;
  creditoRemanenteSugerido?: number;
  exencionIVA?: number;
  onExencionIVAChange?: (value: number) => void;
  retencionISR?: number;
  onRetencionISRChange?: (value: number) => void;
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

function CopyButton({ value, copyText }: { value: number; copyText?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(copyText ?? value.toFixed(2));
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

function CasillaRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm">{label}</span>
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
  isoCalculo,
  month, 
  year,
  creditoRemanente = 0,
  onCreditoRemanenteChange,
  creditoRemanenteSugerido = 0,
  exencionIVA = 0,
  onExencionIVAChange,
  retencionISR = 0,
  onRetencionISRChange
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
          {/* Two-column layout: Bases | Impuestos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT COLUMN: Base amounts */}
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Ventas (Base)</h4>
                <div className="bg-muted/30 rounded-lg p-3">
                  <CasillaRow label="Ventas Gravadas Locales" value={ivaGeneral.ventasGravadasLocales} />
                  <CasillaRow label="Exportaciones" value={ivaGeneral.exportaciones} />
                  <CasillaRow label="Ventas Exentas" value={ivaGeneral.ventasExentas} />
                  <CasillaRow label="Total Ventas" value={ivaGeneral.totalVentas} />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Compras (Base)</h4>
                <div className="bg-muted/30 rounded-lg p-3">
                  {ivaGeneral.comprasBienes > 0 && (
                    <CasillaRow label="Otras Compras (Bienes)" value={ivaGeneral.comprasBienes} />
                  )}
                  {ivaGeneral.comprasServicios > 0 && (
                    <CasillaRow label="Compras de Servicios" value={ivaGeneral.comprasServicios} />
                  )}
                  {ivaGeneral.importaciones > 0 && (
                    <CasillaRow label="Importaciones" value={ivaGeneral.importaciones} />
                  )}
                  {ivaGeneral.comprasActivosFijos > 0 && (
                    <CasillaRow label="Activos Fijos" value={ivaGeneral.comprasActivosFijos} />
                  )}
                  {ivaGeneral.comprasExentas > 0 && (
                    <CasillaRow label="Compras Exentas" value={ivaGeneral.comprasExentas} />
                  )}
                  {ivaGeneral.notasCreditoCompras > 0 && (
                    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-destructive">
                      <span className="text-sm">(-) Notas de Crédito Recibidas</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">-{formatCurrency(ivaGeneral.notasCreditoCompras)}</span>
                        <CopyButton value={ivaGeneral.notasCreditoCompras} />
                      </div>
                    </div>
                  )}
                  <div className="border-t border-border mt-2 pt-2">
                    <CasillaRow label="Total Compras Gravadas Neto" value={ivaGeneral.comprasNetoGravadas} />
                  </div>
                </div>
              </div>

              {/* Resumen por Tipo de Documento */}
              {ivaGeneral.documentosPorTipo && ivaGeneral.documentosPorTipo.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Por Tipo de Documento</h4>
                  <div className="bg-muted/30 rounded-lg p-3">
                    {ivaGeneral.documentosPorTipo.map((doc) => (
                      <div key={doc.tipo} className="flex items-center justify-between py-1.5 text-sm">
                        <span className="text-muted-foreground">{doc.tipo} ({doc.cantidad})</span>
                        <span className="font-mono">{formatCurrency(doc.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN: Tax amounts */}
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Débito Fiscal (IVA Ventas)</h4>
                <div className="bg-muted/30 rounded-lg p-3">
                  <CasillaRow label="Débito Fiscal del Período" value={ivaGeneral.debitoFiscal} />
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Crédito Fiscal (IVA Compras)</h4>
                <div className="bg-muted/30 rounded-lg p-3">
                  {ivaGeneral.creditoFiscalBienes > 0 && (
                    <CasillaRow label="IVA Otras Compras (Bienes)" value={ivaGeneral.creditoFiscalBienes} />
                  )}
                  {ivaGeneral.creditoFiscalServicios > 0 && (
                    <CasillaRow label="IVA Servicios" value={ivaGeneral.creditoFiscalServicios} />
                  )}
                  {ivaGeneral.creditoFiscalImportaciones > 0 && (
                    <CasillaRow label="IVA Importaciones" value={ivaGeneral.creditoFiscalImportaciones} />
                  )}
                  {ivaGeneral.creditoFiscalActivosFijos > 0 && (
                    <CasillaRow label="IVA Activos Fijos" value={ivaGeneral.creditoFiscalActivosFijos} />
                  )}
                  {ivaGeneral.notasCreditoIVA > 0 && (
                    <div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-destructive">
                      <span className="text-sm">(-) IVA Notas de Crédito</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">-{formatCurrency(ivaGeneral.notasCreditoIVA)}</span>
                        <CopyButton value={ivaGeneral.notasCreditoIVA} />
                      </div>
                    </div>
                  )}
                  <div className="border-t border-border mt-2 pt-2">
                    <CasillaRow label="Crédito Fiscal del Período" value={ivaGeneral.creditoFiscal} />
                  </div>
                </div>
              </div>

              {/* Resultado within right column */}
              <div className="border-t border-border pt-4 space-y-3">
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Resultado</h4>
                <CasillaRow label="Diferencia (Débito - Crédito)" value={ivaGeneral.diferencia} />
                
                {/* Crédito Remanente Editable */}
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm">Crédito Remanente Mes Anterior</span>
                    {creditoRemanenteSugerido > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 px-2 text-xs gap-1 w-fit"
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
                            <p>Calculado del mes anterior</p>
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
                      className="w-28 text-right font-mono h-8"
                      placeholder="0.00"
                    />
                    <CopyButton value={creditoRemanente} />
                  </div>
                </div>

                {/* Exención IVA */}
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-sm">(-) Exención IVA Realizada</span>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={exencionIVA}
                      onChange={(e) => onExencionIVAChange?.(parseFloat(e.target.value) || 0)}
                      className="w-28 text-right font-mono h-8"
                      placeholder="0.00"
                    />
                    <CopyButton value={exencionIVA} />
                  </div>
                </div>
                
                {ivaGeneral.ivaAPagar > 0 ? (
                  <TotalRow label="IVA A PAGAR" value={ivaGeneral.ivaAPagar} isHighlight />
                ) : ivaGeneral.creditoRemanenteProximoMes > 0 ? (
                  <div className="flex items-center justify-between py-3 bg-orange-500/10 px-3 rounded-lg">
                    <span className="font-semibold text-orange-600 dark:text-orange-400 text-sm">CRÉDITO FISCAL</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
                        {formatCurrency(Math.abs(ivaGeneral.creditoRemanenteProximoMes))}
                      </span>
                      <CopyButton value={Math.abs(ivaGeneral.creditoRemanenteProximoMes)} />
                    </div>
                  </div>
                ) : (
                  <TotalRow label="IVA A PAGAR" value={0} isHighlight />
                )}
              </div>
            </div>
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
            <CasillaRow label="Total Ingresos del Mes" value={ivaPequeno.totalIngresos} />
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Tasa de Impuesto</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{ivaPequeno.tasaImpuesto}%</span>
                <CopyButton value={ivaPequeno.tasaImpuesto} copyText={`${ivaPequeno.tasaImpuesto}%`} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <TotalRow label="IMPUESTO A PAGAR" value={ivaPequeno.impuestoAPagar} isHighlight />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (formType === 'ISR_MENSUAL' && isrMensual) {
    const UMBRAL = 30000;
    const usaSegundoTramo = isrMensual.ingresosBrutos > UMBRAL;
    
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>SAT-1311 ISR Opción Mensual</span>
            <span className="text-sm font-normal text-muted-foreground">Período: {periodLabel}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Ingresos */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Ingresos</h4>
            <div className="bg-muted/30 rounded-lg p-3">
              <CasillaRow label="Ingresos Brutos del Mes" value={isrMensual.ingresosBrutos} />
            </div>
          </div>

          {/* Cálculo del ISR con escala progresiva */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Cálculo del ISR (Escala Progresiva)
            </h4>
            <div className="bg-muted/30 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <span className="text-sm">Primer Tramo (hasta Q30,000 al 5%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{formatCurrency(isrMensual.primerTramo)}</span>
                  <span className="text-xs text-muted-foreground">× 5%</span>
                  <span className="font-mono font-medium">=</span>
                  <span className="font-mono font-medium">
                    {formatCurrency(Math.min(isrMensual.primerTramo * 0.05, 1500))}
                  </span>
                </div>
              </div>
              
              {usaSegundoTramo && (
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">Segundo Tramo (excedente al 7%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{formatCurrency(isrMensual.segundoTramo)}</span>
                    <span className="text-xs text-muted-foreground">× 7%</span>
                    <span className="font-mono font-medium">=</span>
                    <span className="font-mono font-medium">
                      {formatCurrency(isrMensual.segundoTramo * 0.07)}
                    </span>
                  </div>
                </div>
              )}
              
              <div className="border-t border-border mt-2 pt-2">
                <CasillaRow label="ISR Bruto Calculado" value={isrMensual.isrBruto} />
              </div>
            </div>
          </div>

          {/* Retención ISR */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Retenciones</h4>
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm">(-) Retención ISR Realizada</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={retencionISR}
                    onChange={(e) => onRetencionISRChange?.(parseFloat(e.target.value) || 0)}
                    className="w-32 text-right font-mono h-8"
                    placeholder="0.00"
                  />
                  <CopyButton value={retencionISR} />
                </div>
              </div>
            </div>
          </div>

          {/* Resultado */}
          <div className="pt-4 border-t">
            <TotalRow label="ISR A PAGAR" value={isrMensual.isrAPagar} isHighlight />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (formType === 'ISO_TRIMESTRAL' && isoCalculo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>ISO Trimestral</span>
            <span className="text-sm font-normal text-muted-foreground">Período: {periodLabel}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="border-primary/30 bg-primary/5">
            <Info className="h-4 w-4" />
            <AlertDescription>
              El formulario ISO de {isoCalculo.anioAplicacion} usa la información final de {isoCalculo.anioBase}.
            </AlertDescription>
          </Alert>

          <div className="bg-muted/30 rounded-lg p-3">
            <CasillaRow label={`Ingresos Netos ${isoCalculo.anioBase}`} value={isoCalculo.ingresosBrutosAnioAnterior} />
            <CasillaRow label={`Compras Netas ${isoCalculo.anioBase}`} value={isoCalculo.comprasAnioAnterior} />
            <CasillaRow label="Base Imponible Anual" value={isoCalculo.baseImponibleAnual} />
            <CasillaRow label="Base Trimestral" value={isoCalculo.baseTrimestral} />
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-sm">Tasa ISO</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">{isoCalculo.tasaImpuesto}%</span>
                <CopyButton value={isoCalculo.tasaImpuesto} copyText={`${isoCalculo.tasaImpuesto}%`} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <TotalRow label="ISO A PAGAR (TRIMESTRE)" value={isoCalculo.impuestoTrimestral} isHighlight />
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

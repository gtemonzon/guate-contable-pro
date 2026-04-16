import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Calculator, AlertCircle } from "lucide-react";
import { useDeclaracionCalculo, TaxFormType, OtroValorISR } from "@/hooks/useDeclaracionCalculo";
import { DeclaracionPreview } from "@/components/declaraciones/DeclaracionPreview";
import { ExportAnexoButton } from "@/components/declaraciones/ExportAnexoButton";
import { Alert, AlertDescription } from "@/components/ui/alert";

const MONTHS = [
  { value: 1, label: "Enero" },
  { value: 2, label: "Febrero" },
  { value: 3, label: "Marzo" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Mayo" },
  { value: 6, label: "Junio" },
  { value: 7, label: "Julio" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Septiembre" },
  { value: 10, label: "Octubre" },
  { value: 11, label: "Noviembre" },
  { value: 12, label: "Diciembre" },
];

const currentYear = new Date().getFullYear();

export default function GenerarDeclaracion() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const [enterpriseName, setEnterpriseName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedFormType, setSelectedFormType] = useState<TaxFormType | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [creditoRemanente, setCreditoRemanente] = useState<number>(0);
  const [exencionIVA, setExencionIVA] = useState<number>(0);
  const [retencionISR, setRetencionISR] = useState<number>(0);
  const [inventarioFinalEstimado, setInventarioFinalEstimado] = useState<number>(0);
  const [otrosValores, setOtrosValores] = useState<OtroValorISR[]>([]);
  const [isrPagadoAnterior, setIsrPagadoAnterior] = useState<number>(0);
  const [periodYears, setPeriodYears] = useState<number[]>([]);

  const {
    loading,
    error,
    sales,
    purchases,
    taxConfigs,
    ivaGeneralCalculo,
    ivaPequenoCalculo,
    isrMensualCalculo,
    isoCalculo,
    isrTrimestralCalculo,
    creditoRemanenteSugerido,
    fetchData,
  } = useDeclaracionCalculo(
    enterpriseId, selectedMonth, selectedYear,
    creditoRemanente, exencionIVA, retencionISR,
    inventarioFinalEstimado, otrosValores, isrPagadoAnterior
  );

  // Load active enterprise
  useEffect(() => {
    const stored = localStorage.getItem("currentEnterpriseId");
    const storedName = localStorage.getItem("currentEnterpriseName");
    if (stored) {
      setEnterpriseId(parseInt(stored, 10));
      setEnterpriseName(storedName || "");
    }
  }, []);

  // Load available years from accounting periods
  useEffect(() => {
    if (!enterpriseId) return;
    supabase
      .from("tab_accounting_periods")
      .select("year")
      .eq("enterprise_id", enterpriseId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const uniqueYears = [...new Set(data.map(p => p.year))].sort((a, b) => b - a);
          setPeriodYears(uniqueYears);
          // If current selection isn't in the list, select the most recent
          if (!uniqueYears.includes(selectedYear)) {
            setSelectedYear(uniqueYears[0]);
          }
        } else {
          // Fallback: wide range
          setPeriodYears(Array.from({ length: 10 }, (_, i) => currentYear - i));
        }
      });
  }, [enterpriseId]);
  // Auto-select form type based on config
  useEffect(() => {
    if (taxConfigs.length > 0 && !selectedFormType) {
      // Prefer IVA_GENERAL or first active config
      const ivaGeneral = taxConfigs.find(c => c.tax_form_type === 'IVA_GENERAL');
      const firstActive = taxConfigs.find(c => c.is_active);
      setSelectedFormType(ivaGeneral?.tax_form_type || firstActive?.tax_form_type || null);
    }
  }, [taxConfigs, selectedFormType]);

  const handleGenerate = () => {
    fetchData();
    setHasGenerated(true);
  };

  const getFormTypeLabel = (type: TaxFormType): string => {
    const labels: Record<TaxFormType, string> = {
      'IVA_PEQUENO': 'SAT-2046 IVA Pequeño Contribuyente',
      'IVA_GENERAL': 'SAT-2237 IVA Régimen General',
      'ISR_MENSUAL': 'SAT-1311 ISR Opción Mensual',
      'ISR_TRIMESTRAL': 'SAT-1341 ISR Trimestral',
      'ISO_TRIMESTRAL': 'ISO Trimestral',
    };
    return labels[type] || type;
  };

  if (!enterpriseId) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Selecciona una empresa activa para generar declaraciones
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Generar Declaración</h1>
        <p className="text-muted-foreground">
          Calcula automáticamente los valores para tus formularios SAT usando los datos del libro de compras y ventas
        </p>
      </div>

      {/* Selector de período y formulario */}
      <Card>
        <CardHeader>
          <CardTitle>Seleccionar Período</CardTitle>
          <CardDescription>
            Empresa activa: <span className="font-medium text-foreground">{enterpriseName}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Mes</Label>
              <Select
                value={String(selectedMonth)}
                onValueChange={(v) => {
                  setSelectedMonth(parseInt(v));
                  setHasGenerated(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Año</Label>
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => {
                  setSelectedYear(parseInt(v));
                  setHasGenerated(false);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Formulario</Label>
              <Select
                value={selectedFormType || ''}
                onValueChange={(v) => setSelectedFormType(v as TaxFormType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar formulario" />
                </SelectTrigger>
                <SelectContent>
                  {taxConfigs.length > 0 ? (
                    taxConfigs.filter(c => c.is_active).map((config) => (
                      <SelectItem key={config.tax_form_type} value={config.tax_form_type}>
                        {getFormTypeLabel(config.tax_form_type)}
                      </SelectItem>
                    ))
                  ) : (
                    <>
                      <SelectItem value="IVA_GENERAL">SAT-2237 IVA Régimen General</SelectItem>
                      <SelectItem value="IVA_PEQUENO">SAT-2046 IVA Pequeño Contribuyente</SelectItem>
                      <SelectItem value="ISR_MENSUAL">SAT-1311 ISR Opción Mensual</SelectItem>
                      <SelectItem value="ISO_TRIMESTRAL">ISO Trimestral</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                onClick={handleGenerate} 
                disabled={loading || !selectedFormType}
                className="w-full gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Calculator className="h-4 w-4" />
                )}
                Generar Cálculo
              </Button>
            </div>
          </div>

          {taxConfigs.length === 0 && (
            <Alert className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No tienes formularios configurados. Ve a Configuración → Formularios de Impuestos para agregar los tipos de formulario que usa tu empresa.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Preview del formulario */}
      {hasGenerated && selectedFormType && (
        <DeclaracionPreview
          formType={selectedFormType}
          ivaGeneral={ivaGeneralCalculo}
          ivaPequeno={ivaPequenoCalculo}
          isrMensual={isrMensualCalculo}
          isoCalculo={isoCalculo}
          isrTrimestral={isrTrimestralCalculo}
          month={selectedMonth}
          year={selectedYear}
          creditoRemanente={creditoRemanente}
          onCreditoRemanenteChange={setCreditoRemanente}
          creditoRemanenteSugerido={creditoRemanenteSugerido}
          exencionIVA={exencionIVA}
          onExencionIVAChange={setExencionIVA}
          retencionISR={retencionISR}
          onRetencionISRChange={setRetencionISR}
          inventarioFinalEstimado={inventarioFinalEstimado}
          onInventarioFinalEstimadoChange={setInventarioFinalEstimado}
          otrosValores={otrosValores}
          onOtrosValoresChange={setOtrosValores}
          isrPagadoAnterior={isrPagadoAnterior}
          onIsrPagadoAnteriorChange={setIsrPagadoAnterior}
        />
      )}

      {/* Botones de exportación */}
      {hasGenerated && selectedFormType === 'IVA_GENERAL' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exportar Anexos</CardTitle>
            <CardDescription>
              Descarga los anexos en formato Excel para cargar en DeclaraGuate
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <ExportAnexoButton
              type="compras"
              data={purchases}
              month={selectedMonth}
              year={selectedYear}
              enterpriseName={enterpriseName}
            />
            <ExportAnexoButton
              type="ventas"
              data={sales}
              month={selectedMonth}
              year={selectedYear}
              enterpriseName={enterpriseName}
            />
          </CardContent>
        </Card>
      )}

      {/* Resumen de datos */}
      {hasGenerated && selectedFormType !== 'ISR_TRIMESTRAL' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ventas del Período</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{sales.length}</p>
              <p className="text-sm text-muted-foreground">facturas procesadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Compras del Período</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{purchases.length}</p>
              <p className="text-sm text-muted-foreground">facturas procesadas</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

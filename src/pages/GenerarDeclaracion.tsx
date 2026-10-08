import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Calculator, AlertCircle, History, RotateCcw, FileCheck, Trash2 } from "lucide-react";
import { useDeclaracionCalculo, TaxFormType, OtroValorISR } from "@/hooks/useDeclaracionCalculo";
import { useCertificatePeriodTotals } from "@/hooks/useTaxCertificates";
import { DeclaracionPreview } from "@/components/declaraciones/DeclaracionPreview";
import { ExportAnexoButton } from "@/components/declaraciones/ExportAnexoButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  DeclarationCalculationRow,
  getCalculationTotal,
  parseCalculationInputs,
  formTypeToTaxType,
  formTypeToPeriodType,
  periodMonthForForm,
} from "@/utils/declarationCalculations";
import TaxFormDialog, { type TaxFormPrefill } from "@/components/impuestos/TaxFormDialog";
import { resolveTaxRegimeAsOf, ivaFormTypeForRegime, regimeAsOfDateForMonth } from "@/utils/taxRegime";
import { validFormTypesForPeriod, chooseAutoFormType, describeValidity } from "@/utils/taxConfigValidity";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Cálculo guardado al que corresponde lo que se ve en pantalla. */
interface ActiveCalc {
  id: number;
  createdAt: string;
  /** Inputs normalizados (parseCalculationInputs) en JSON, para comparar. */
  inputsJson: string;
  total: number;
}


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
  // ¿El usuario eligió el tipo de formulario a mano? Entonces no se preselecciona.
  const [formTypeTouched, setFormTypeTouched] = useState(false);
  // Régimen de IVA vigente en el mes elegido (historial de régimen).
  const [regimeInfo, setRegimeInfo] = useState<{
    key: string;
    regime: string | null;
    effectiveFrom: string | null;
  } | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [creditoRemanente, setCreditoRemanente] = useState<number>(0);
  const [exencionIVA, setExencionIVA] = useState<number>(0);
  const [retencionISR, setRetencionISR] = useState<number>(0);
  const [retencionIVAPequeno, setRetencionIVAPequeno] = useState<number>(0);
  const [inventarioFinalEstimado, setInventarioFinalEstimado] = useState<number>(0);
  // ¿El usuario editó (o cargó de un cálculo guardado) el inventario final? Si no, el
  // campo sigue al sugerido por contabilidad.
  const [inventarioFinalTocado, setInventarioFinalTocado] = useState(false);
  const [otrosValores, setOtrosValores] = useState<OtroValorISR[]>([]);
  const [isrPagadoAnterior, setIsrPagadoAnterior] = useState<number>(0);
  const [periodYears, setPeriodYears] = useState<number[]>([]);
  const [pendingSave, setPendingSave] = useState(false);
  const [savedCalculations, setSavedCalculations] = useState<DeclarationCalculationRow[]>([]);
  // Cálculos ligados a un formulario activo (id del cálculo → número de formulario): no se eliminan.
  const [linkedFormByCalc, setLinkedFormByCalc] = useState<Record<number, string>>({});
  const [calcToDelete, setCalcToDelete] = useState<DeclarationCalculationRow | null>(null);
  const [deletingCalc, setDeletingCalc] = useState(false);
  const [activeCalc, setActiveCalc] = useState<ActiveCalc | null>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerPrefill, setRegisterPrefill] = useState<TaxFormPrefill | null>(null);
  const { toast } = useToast();


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
    creditoRemanente, exencionIVA, retencionISR, retencionIVAPequeno,
    inventarioFinalEstimado, otrosValores, isrPagadoAnterior
  );

  const { data: certTotals } = useCertificatePeriodTotals(enterpriseId, selectedMonth, selectedYear);

  // Prellenado: mientras no se haya tocado, el inventario final estimado = sugerido.
  const inventarioFinalSugerido = isrTrimestralCalculo.inventarioFinalSugerido;
  useEffect(() => {
    if (!inventarioFinalTocado) setInventarioFinalEstimado(inventarioFinalSugerido);
  }, [inventarioFinalSugerido, inventarioFinalTocado]);
  // El guardado espera a que el prellenado se aplique (no se guarda un 0 mientras en
  // pantalla se ve el sugerido).
  const inventarioPrellenadoPendiente =
    !inventarioFinalTocado && inventarioFinalEstimado !== inventarioFinalSugerido;

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
  // Régimen vigente en el mes elegido (último día del mes, como Libros Fiscales).
  const regimeKey = enterpriseId ? `${enterpriseId}:${selectedYear}-${selectedMonth}` : "";
  useEffect(() => {
    if (!enterpriseId) return;
    let cancelled = false;
    const key = `${enterpriseId}:${selectedYear}-${selectedMonth}`;
    resolveTaxRegimeAsOf(enterpriseId, regimeAsOfDateForMonth(selectedYear, selectedMonth))
      .then((r) => { if (!cancelled) setRegimeInfo({ key, ...r }); })
      .catch((e) => console.error("Error resolviendo el régimen vigente:", e));
    return () => { cancelled = true; };
  }, [enterpriseId, selectedYear, selectedMonth]);
  const currentRegime = regimeInfo && regimeInfo.key === regimeKey ? regimeInfo : null;
  const regimeFormType = ivaFormTypeForRegime(currentRegime?.regime);

  // Formularios con configuración vigente en el período elegido (trimestrales: el
  // trimestre que contiene el mes). Sin ninguna fila de configuración se conserva el
  // comportamiento anterior (lista fija de formularios).
  const validFormTypes = useMemo(
    () => validFormTypesForPeriod(taxConfigs, selectedYear, selectedMonth) as TaxFormType[],
    [taxConfigs, selectedYear, selectedMonth],
  );

  // Auto-select form type (sin elección manual): el IVA del régimen vigente en el mes si
  // está vigente en la configuración; si no, el actual si sigue vigente o el primero vigente.
  useEffect(() => {
    if (taxConfigs.length === 0 || formTypeTouched) return;
    const next = chooseAutoFormType({ current: selectedFormType, validTypes: validFormTypes, regimeFormType }) as TaxFormType | null;
    if (next !== selectedFormType) setSelectedFormType(next);
  }, [taxConfigs, validFormTypes, selectedFormType, regimeFormType, formTypeTouched]);

  // Elección manual de un formulario que no está vigente en el período (aviso, no bloquea).
  const selectedNotValid =
    taxConfigs.length > 0 && !!selectedFormType && !validFormTypes.includes(selectedFormType);
  const selectedConfig = selectedFormType ? taxConfigs.find(c => c.tax_form_type === selectedFormType) : undefined;

  const currentResult = useMemo((): Record<string, unknown> | null => {
    switch (selectedFormType) {
      case 'IVA_GENERAL': return { ...ivaGeneralCalculo };
      case 'IVA_PEQUENO': return { ...ivaPequenoCalculo };
      case 'ISR_MENSUAL': return { ...isrMensualCalculo };
      case 'ISO_TRIMESTRAL': return { ...isoCalculo };
      case 'ISR_TRIMESTRAL': return { ...isrTrimestralCalculo };
      default: return null;
    }
  }, [selectedFormType, ivaGeneralCalculo, ivaPequenoCalculo, isrMensualCalculo, isoCalculo, isrTrimestralCalculo]);

  /** Formularios activos ligados a estos cálculos (id del cálculo → número de formulario). */
  const fetchLinkedForms = async (calcIds: number[]): Promise<Record<number, string>> => {
    if (calcIds.length === 0) return {};
    const { data, error: linkError } = await supabase
      .from("tab_tax_forms")
      .select("id, form_number, declaration_calculation_id")
      .in("declaration_calculation_id", calcIds)
      .eq("is_active", true);
    if (linkError) {
      console.error("Error verificando formularios ligados:", linkError);
      // Por seguridad, si no se puede verificar, se tratan como ligados.
      return Object.fromEntries(calcIds.map((id) => [id, "(no verificado)"]));
    }
    const map: Record<number, string> = {};
    for (const f of data ?? []) {
      if (f.declaration_calculation_id != null) map[f.declaration_calculation_id] = f.form_number;
    }
    return map;
  };

  const fetchSavedCalculations = useCallback(async () => {
    if (!enterpriseId || !selectedFormType) {
      setSavedCalculations([]);
      return;
    }
    const { data, error: fetchError } = await supabase
      .from("tab_declaration_calculations")
      .select("*")
      .eq("enterprise_id", enterpriseId)
      .eq("form_type", selectedFormType)
      .eq("period_year", selectedYear)
      .eq("period_month", selectedMonth)
      .order("created_at", { ascending: false })
      .limit(20);
    if (fetchError) {
      console.error("Error cargando cálculos guardados:", fetchError);
      return;
    }
    const rows = (data ?? []) as DeclarationCalculationRow[];
    setSavedCalculations(rows);
    setLinkedFormByCalc(await fetchLinkedForms(rows.map((r) => r.id)));
  }, [enterpriseId, selectedFormType, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchSavedCalculations();
  }, [fetchSavedCalculations]);

  const handleGenerate = () => {
    fetchData();
    setHasGenerated(true);
    setPendingSave(true);
  };

  // Inputs actuales de la vista previa (los mismos que se guardan en el snapshot).
  const currentInputs = useMemo(() => ({
    credito_remanente: creditoRemanente,
    exencion_iva: exencionIVA,
    retencion_isr: retencionISR,
    retencion_iva_pequeno: retencionIVAPequeno,
    inventario_final_estimado: inventarioFinalEstimado,
    otros_valores: otrosValores,
    isr_pagado_anterior: isrPagadoAnterior,
  }), [creditoRemanente, exencionIVA, retencionISR, retencionIVAPequeno, inventarioFinalEstimado, otrosValores, isrPagadoAnterior]);
  const currentInputsJson = useMemo(() => JSON.stringify(parseCalculationInputs(currentInputs)), [currentInputs]);
  const currentTotal = selectedFormType && currentResult
    ? round2(getCalculationTotal(selectedFormType, currentResult) ?? 0)
    : 0;

  // El cálculo activo deja de valer al cambiar de período o de formulario.
  useEffect(() => {
    setActiveCalc(null);
  }, [selectedMonth, selectedYear, selectedFormType, enterpriseId]);

  /** Guarda el snapshot de lo que se ve en pantalla y lo deja como cálculo activo. */
  const saveCalculationSnapshot = useCallback(async (): Promise<{ id: number; createdAt: string } | null> => {
    if (!enterpriseId || !selectedFormType || !currentResult) return null;
    setSavingSnapshot(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error: insertError } = await supabase
        .from("tab_declaration_calculations")
        .insert({
          enterprise_id: enterpriseId,
          form_type: selectedFormType,
          period_month: selectedMonth,
          period_year: selectedYear,
          inputs: JSON.parse(JSON.stringify(currentInputs)) as Json,
          result: JSON.parse(JSON.stringify(currentResult)) as Json,
          created_by: userData.user?.id ?? null,
        })
        .select("id, created_at")
        .single();
      if (insertError || !data) {
        console.error("Error guardando cálculo:", insertError);
        toast({
          title: "No se pudo guardar el cálculo",
          description: insertError?.message,
          variant: "destructive",
        });
        return null;
      }
      toast({ title: "Cálculo guardado" });
      setActiveCalc({ id: data.id, createdAt: data.created_at, inputsJson: currentInputsJson, total: currentTotal });
      fetchSavedCalculations();
      return { id: data.id, createdAt: data.created_at };
    } finally {
      setSavingSnapshot(false);
    }
  }, [enterpriseId, selectedFormType, currentResult, selectedMonth, selectedYear, currentInputs,
      currentInputsJson, currentTotal, toast, fetchSavedCalculations]);

  // Guarda el snapshot automáticamente al terminar el cálculo
  useEffect(() => {
    if (!pendingSave || loading || !enterpriseId || !selectedFormType || !currentResult) return;
    if (selectedFormType === 'ISR_TRIMESTRAL' && inventarioPrellenadoPendiente) return;
    if (error) {
      setPendingSave(false);
      return;
    }
    setPendingSave(false);
    void saveCalculationSnapshot();
  }, [pendingSave, loading, error, enterpriseId, selectedFormType, currentResult,
      inventarioPrellenadoPendiente, saveCalculationSnapshot]);

  /**
   * Registrar el formulario presentado: usa el cálculo activo si lo que se ve en
   * pantalla es lo mismo (inputs y total); si no, guarda un snapshot nuevo. Luego abre
   * el diálogo de formulario con los datos ya puestos.
   */
  const handleRegisterForm = async () => {
    if (!selectedFormType || !currentResult) return;
    let calc: { id: number; createdAt: string } | null =
      activeCalc && activeCalc.inputsJson === currentInputsJson && activeCalc.total === currentTotal
        ? { id: activeCalc.id, createdAt: activeCalc.createdAt }
        : null;
    if (!calc) calc = await saveCalculationSnapshot();
    if (!calc) return;
    setRegisterPrefill({
      taxType: formTypeToTaxType(selectedFormType),
      periodType: formTypeToPeriodType(selectedFormType),
      periodMonth: periodMonthForForm(selectedFormType, selectedMonth),
      periodYear: selectedYear,
      amount: currentTotal,
      calculationId: calc.id,
      calculationCreatedAt: calc.createdAt,
    });
    setRegisterOpen(true);
  };

  /** Elimina un cálculo guardado que no esté ligado a un formulario activo. */
  const handleDeleteCalc = async () => {
    const row = calcToDelete;
    if (!row || !enterpriseId) return;
    setDeletingCalc(true);
    try {
      // Se vuelve a verificar al confirmar: pudo registrarse un formulario mientras tanto.
      const linked = await fetchLinkedForms([row.id]);
      if (linked[row.id]) {
        setLinkedFormByCalc((prev) => ({ ...prev, ...linked }));
        toast({
          title: "No se puede eliminar",
          description: `El cálculo está ligado al formulario ${linked[row.id]}.`,
          variant: "destructive",
        });
        return;
      }
      const { data: deleted, error: deleteError } = await supabase
        .from("tab_declaration_calculations")
        .delete()
        .eq("id", row.id)
        .eq("enterprise_id", enterpriseId)
        .select("id");
      if (deleteError) throw deleteError;
      // Sin filas borradas (sin permiso o ya no existía): no se reporta como éxito.
      if (!deleted || deleted.length === 0) throw new Error("El cálculo no se eliminó (sin permiso o ya no existe).");
      setSavedCalculations((prev) => prev.filter((r) => r.id !== row.id));
      setActiveCalc((prev) => (prev?.id === row.id ? null : prev));
      toast({ title: "Cálculo eliminado" });
    } catch (e) {
      console.error("Error eliminando cálculo:", e);
      toast({
        title: "No se pudo eliminar el cálculo",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDeletingCalc(false);
      setCalcToDelete(null);
    }
  };

  const handleLoadSaved = (row: DeclarationCalculationRow) => {
    const inputs = parseCalculationInputs(row.inputs);
    setCreditoRemanente(inputs.credito_remanente);
    setExencionIVA(inputs.exencion_iva);
    setRetencionISR(inputs.retencion_isr);
    setRetencionIVAPequeno(inputs.retencion_iva_pequeno);
    setInventarioFinalTocado(true);
    setInventarioFinalEstimado(inputs.inventario_final_estimado);
    setOtrosValores(inputs.otros_valores);
    setIsrPagadoAnterior(inputs.isr_pagado_anterior);
    setActiveCalc({
      id: row.id,
      createdAt: row.created_at,
      inputsJson: JSON.stringify(inputs),
      total: round2(getCalculationTotal(row.form_type, row.result) ?? 0),
    });
    setHasGenerated(true);
    toast({ title: "Cálculo cargado" });
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
                onValueChange={(v) => {
                  setFormTypeTouched(true);
                  setSelectedFormType(v as TaxFormType);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar formulario" />
                </SelectTrigger>
                <SelectContent>
                  {taxConfigs.length > 0 ? (
                    <>
                      {validFormTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {getFormTypeLabel(type)}
                        </SelectItem>
                      ))}
                      {/* El elegido a mano sigue visible aunque no esté vigente en el período. */}
                      {selectedNotValid && selectedFormType && (
                        <SelectItem key={selectedFormType} value={selectedFormType}>
                          {getFormTypeLabel(selectedFormType)} (no vigente)
                        </SelectItem>
                      )}
                      {validFormTypes.length === 0 && !selectedNotValid && (
                        <SelectItem value="__none__" disabled>
                          Sin formularios vigentes en este período
                        </SelectItem>
                      )}
                    </>
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

          {(selectedFormType === 'IVA_GENERAL' || selectedFormType === 'IVA_PEQUENO') &&
            regimeFormType && selectedFormType !== regimeFormType && (
            <Alert className="mt-4 border-warning/50 bg-warning/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                En {MONTHS[selectedMonth - 1]?.label} {selectedYear} esta empresa era{" "}
                {regimeFormType === 'IVA_PEQUENO' ? "Pequeño Contribuyente" : "Contribuyente General"}
                {currentRegime?.effectiveFrom ? ` (vigente desde ${currentRegime.effectiveFrom})` : ""}.
                {" "}Estás generando {getFormTypeLabel(selectedFormType)}.
              </AlertDescription>
            </Alert>
          )}

          {selectedNotValid && selectedFormType && (
            <Alert className="mt-4 border-warning/50 bg-warning/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Esta empresa no tiene configurado {getFormTypeLabel(selectedFormType)} como vigente en{" "}
                {MONTHS[selectedMonth - 1]?.label} {selectedYear} (
                {selectedConfig
                  ? (selectedConfig.is_active ? describeValidity(selectedConfig) : "inactivo")
                  : "sin configuración"}
                ).
              </AlertDescription>
            </Alert>
          )}

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
          retencionISRSugerida={certTotals?.isrRetainedReceived ?? 0}
          retencionIVAPequeno={retencionIVAPequeno}
          onRetencionIVAPequenoChange={setRetencionIVAPequeno}
          retencionIVAPequenoSugerida={certTotals?.vatRetainedReceived ?? 0}
          exencionIVASugerida={certTotals?.vatExemptionIssuedBase ?? 0}
          vatRetenidoTercerosInfo={certTotals?.vatRetainedReceived ?? 0}
          vatRetenidoEmitidoInfo={certTotals?.vatRetainedIssued ?? 0}
          inventarioFinalEstimado={inventarioFinalEstimado}
          onInventarioFinalEstimadoChange={(value) => {
            setInventarioFinalTocado(true);
            setInventarioFinalEstimado(value);
          }}
          onInventarioFinalSugeridoReset={() => {
            setInventarioFinalTocado(false);
            setInventarioFinalEstimado(inventarioFinalSugerido);
          }}
          otrosValores={otrosValores}
          onOtrosValoresChange={setOtrosValores}
          isrPagadoAnterior={isrPagadoAnterior}
          onIsrPagadoAnteriorChange={setIsrPagadoAnterior}
        />
      )}

      {hasGenerated && selectedFormType && (
        <div className="space-y-1">
          <Button
            variant="outline"
            onClick={() => void handleRegisterForm()}
            disabled={
              loading || pendingSave || savingSnapshot ||
              (selectedFormType === 'ISR_TRIMESTRAL' && inventarioPrellenadoPendiente)
            }
            className="gap-2"
          >
            {savingSnapshot ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck className="h-4 w-4" />}
            Registrar formulario presentado
          </Button>
          <p className="text-xs text-muted-foreground">
            Úsalo cuando ya presentaste el formulario en la SAT; podrás adjuntar el PDF.
          </p>
        </div>
      )}

      <AlertDialog
        open={calcToDelete !== null}
        onOpenChange={(open) => { if (!open && !deletingCalc) setCalcToDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este cálculo?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {calcToDelete && (
                  <p className="font-medium text-foreground">
                    {new Date(calcToDelete.created_at).toLocaleString("es-GT")}
                    {(() => {
                      const total = getCalculationTotal(calcToDelete.form_type, calcToDelete.result);
                      return total !== null
                        ? ` · Total a pagar: Q${total.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "";
                    })()}
                  </p>
                )}
                <p>Se borra de forma definitiva; no afecta a ningún formulario registrado.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus disabled={deletingCalc}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteCalc();
              }}
              disabled={deletingCalc}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingCalc && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Eliminar cálculo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {enterpriseId && (
        <TaxFormDialog
          open={registerOpen}
          onOpenChange={() => setRegisterOpen(false)}
          enterpriseId={enterpriseId}
          editingForm={null}
          prefill={registerPrefill}
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

      {/* Cálculos anteriores de este período */}
      {selectedFormType && savedCalculations.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <Accordion type="single" collapsible>
              <AccordionItem value="saved" className="border-none">
                <AccordionTrigger className="py-2">
                  <span className="flex items-center gap-2 text-base font-medium">
                    <History className="h-4 w-4" />
                    Cálculos anteriores de este período ({savedCalculations.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {savedCalculations.map((row) => {
                      const total = getCalculationTotal(row.form_type, row.result);
                      return (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-4 rounded-md border p-3"
                        >
                          <div className="text-sm">
                            <p className="font-medium">
                              {new Date(row.created_at).toLocaleString("es-GT")}
                            </p>
                            {total !== null && (
                              <p className="text-muted-foreground">
                                Total a pagar: Q{total.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => handleLoadSaved(row)}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Cargar
                            </Button>
                            {linkedFormByCalc[row.id] ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    {/* span: un botón deshabilitado no dispara el tooltip */}
                                    <span tabIndex={0}>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled
                                        aria-label="Eliminar cálculo"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Ligado al formulario {linkedFormByCalc[row.id]}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Eliminar cálculo"
                                aria-label="Eliminar cálculo"
                                onClick={() => setCalcToDelete(row)}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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

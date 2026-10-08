import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Save, Info, Plus, Trash2, ChevronDown } from "lucide-react";
import { describeValidity } from "@/utils/taxConfigValidity";
import { getDefaultDueDateConfigs } from "@/utils/dueDateCalculations";
import {
  describeDueDateRule,
  validateDueDateRows,
  planDueDateSave,
  isPermissionError,
  type DueDateRow,
} from "@/utils/dueDateRules";

interface EnterpriseDueDateConfigProps {
  enterpriseId: number;
}

/** Fila de tab_tax_due_date_config leída con select('*') (incluye la vigencia). */
interface DueDateConfigDbRow {
  id: number;
  tax_type: string;
  tax_label: string;
  calculation_type: string;
  days_value: number | null;
  reference_period: string;
  consider_holidays: boolean | null;
  is_active: boolean | null;
  effective_from?: string | null;
  effective_to?: string | null;
}

interface EditableRow extends DueDateRow {
  effective_from: string | null;
  effective_to: string | null;
}

const PERMISSION_MESSAGE = "Solo los administradores de la empresa pueden cambiar los vencimientos";

const isCustomRow = (row: { tax_type: string }) => row.tax_type.startsWith("custom_");

const ruleText = (row: EditableRow) =>
  `${describeDueDateRule(row)}${row.consider_holidays ? " (considera días feriados)" : ""}`;

/**
 * Vencimientos y alertas de una empresa (tab_tax_due_date_config). Única
 * implementación: la usan Editar Empresa > Impuestos y Configuración > Tributario >
 * Fechas de Vencimiento.
 */
export function EnterpriseDueDateConfig({ enterpriseId }: EnterpriseDueDateConfigProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EditableRow[]>([]);
  // tax_type guardados en la base (para saber qué filas personalizadas se quitaron).
  const [existingTypes, setExistingTypes] = useState<string[]>([]);
  const [usingDefaults, setUsingDefaults] = useState(false);
  const [errors, setErrors] = useState<Record<number, string[]>>({});

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tab_tax_due_date_config")
        .select("*")
        .eq("enterprise_id", enterpriseId)
        .order("display_order")
        .order("id");
      if (error) throw error;

      const dbRows = (data || []) as unknown as DueDateConfigDbRow[];
      setExistingTypes(dbRows.map((r) => r.tax_type));
      setErrors({});
      if (dbRows.length > 0) {
        setUsingDefaults(false);
        setRows(dbRows.map((r) => ({
          tax_type: r.tax_type,
          tax_label: r.tax_label,
          calculation_type: r.calculation_type,
          days_value: r.days_value,
          reference_period: r.reference_period,
          consider_holidays: r.consider_holidays ?? true,
          is_active: r.is_active ?? true,
          effective_from: r.effective_from ?? null,
          effective_to: r.effective_to ?? null,
        })));
      } else {
        setUsingDefaults(true);
        setRows(getDefaultDueDateConfigs().map((c) => ({ ...c, effective_from: null, effective_to: null })));
      }
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al cargar configuración",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [enterpriseId, toast]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, {
      tax_type: `custom_${Date.now()}`,
      tax_label: "Nuevo Impuesto",
      calculation_type: "last_business_day",
      days_value: 0,
      reference_period: "current_month",
      consider_holidays: true,
      is_active: true,
      effective_from: null,
      effective_to: null,
    }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setErrors({});
  };

  const handleSave = async () => {
    // Validar ANTES de escribir.
    const rowErrors = validateDueDateRows(rows);
    if (rowErrors.length > 0) {
      setErrors(Object.fromEntries(rowErrors.map((e) => [e.index, e.messages])));
      const first = rowErrors[0];
      toast({
        variant: "destructive",
        title: "Revisa los vencimientos",
        description: `${rows[first.index]?.tax_label || first.tax_type}: ${first.messages.join(". ")}`,
      });
      return;
    }
    setErrors({});

    const { upserts, removedTypes } = planDueDateSave(existingTypes, rows);
    setSaving(true);
    try {
      // Upsert por (enterprise_id, tax_type): si falla, no cambia nada.
      const payload = upserts.map((r) => ({
        enterprise_id: enterpriseId,
        tax_type: r.tax_type,
        tax_label: r.tax_label.trim(),
        calculation_type: r.calculation_type,
        days_value: r.days_value,
        reference_period: r.reference_period,
        consider_holidays: r.consider_holidays,
        is_active: r.is_active,
        display_order: r.display_order,
        effective_from: r.effective_from ?? null,
        effective_to: r.effective_to ?? null,
      }));
      // Conversión explícita: los tipos generados aún no incluyen effective_from/effective_to.
      const { error: upsertError } = await supabase
        .from("tab_tax_due_date_config")
        .upsert(payload as unknown as TablesInsert<"tab_tax_due_date_config">[], {
          onConflict: "enterprise_id,tax_type",
        });
      if (upsertError) throw upsertError;

      // Después: quitar las filas personalizadas que se eliminaron en pantalla.
      if (removedTypes.length > 0) {
        const { error: deleteError } = await supabase
          .from("tab_tax_due_date_config")
          .delete()
          .eq("enterprise_id", enterpriseId)
          .in("tax_type", removedTypes);
        if (deleteError) throw deleteError;
      }

      // Notificaciones no leídas de esos vencimientos: el generador las recrea con
      // las fechas nuevas.
      const notificationTypes = [...rows.map((r) => r.tax_type), ...removedTypes].map((t) => `vencimiento_${t}`);
      if (notificationTypes.length > 0) {
        const { error: notificationsError } = await supabase
          .from("tab_notifications")
          .delete()
          .eq("enterprise_id", enterpriseId)
          .eq("is_read", false)
          .in("notification_type", notificationTypes);
        if (notificationsError) console.error("Error limpiando notificaciones de vencimiento:", notificationsError);
      }

      toast({
        title: "Configuración guardada",
        description: "Los vencimientos de la empresa se actualizaron correctamente",
      });

      // EnterpriseCard escucha "taxesChanged"; el Dashboard recalcula sus tarjetas.
      window.dispatchEvent(new CustomEvent("taxesChanged", { detail: { enterpriseId } }));
      queryClient.invalidateQueries({ queryKey: ["dashboard-tax-data", enterpriseId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-tax-deadlines", enterpriseId] });

      await fetchRows();
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string } | null;
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: isPermissionError(err)
          ? PERMISSION_MESSAGE
          : error instanceof Error ? error.message : (err?.message ?? String(error)),
      });
    } finally {
      setSaving(false);
    }
  };

  const activeCount = rows.filter((r) => r.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vencimientos y alertas</CardTitle>
          <CardDescription>
            Define de qué impuestos se generan alertas de vencimiento. Los formularios que ofrece el Generador de
            Declaraciones se definen en 'Formularios de declaración'.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {usingDefaults && (
            <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              Esta empresa aún no tiene configuración propia: se muestran los valores por defecto. Al guardar se crean
              sus filas.
            </p>
          )}

          {rows.map((row, index) => {
            const custom = isCustomRow(row);
            const rowErrors = errors[index];
            return (
              <div
                key={row.tax_type}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  row.is_active ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                }`}
              >
                <Checkbox
                  id={row.tax_type}
                  checked={row.is_active}
                  onCheckedChange={(checked) => updateRow(index, { is_active: checked === true })}
                  className="mt-0.5"
                  aria-label="Activo"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    {custom ? (
                      <Input
                        value={row.tax_label}
                        onChange={(e) => updateRow(index, { tax_label: e.target.value })}
                        className="h-8 max-w-xs"
                        aria-label="Etiqueta"
                      />
                    ) : (
                      <Label
                        htmlFor={row.tax_type}
                        className={`font-medium cursor-pointer ${
                          row.is_active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {row.tax_label}
                      </Label>
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <p className="text-sm">Vencimiento: {ruleText(row)}</p>
                          {row.tax_type === "isr_mensual" && (
                            <p className="text-sm mt-1">
                              Es el vencimiento de las retenciones, no el ISR de opción simplificada (5%/7%); ese
                              formulario se configura en 'Formularios de declaración'.
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {custom && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(index)}
                        className="ml-auto h-8 w-8 text-destructive hover:text-destructive"
                        aria-label="Eliminar impuesto"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ruleText(row)}</p>

                  {row.is_active && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="flex items-center gap-1">
                        <Label htmlFor={`${row.tax_type}-from`} className="text-xs text-muted-foreground">Vigente desde</Label>
                        <Input
                          id={`${row.tax_type}-from`}
                          type="date"
                          value={row.effective_from ?? ""}
                          onChange={(e) => updateRow(index, { effective_from: e.target.value || null })}
                          className="h-8 w-40"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Label htmlFor={`${row.tax_type}-to`} className="text-xs text-muted-foreground">Hasta</Label>
                        <Input
                          id={`${row.tax_type}-to`}
                          type="date"
                          value={row.effective_to ?? ""}
                          onChange={(e) => updateRow(index, { effective_to: e.target.value || null })}
                          className="h-8 w-40"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{describeValidity(row)}</span>
                    </div>
                  )}

                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="group h-7 px-2 text-xs text-muted-foreground">
                        <ChevronDown className="mr-1 h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
                        Reglas de cálculo
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="flex flex-wrap items-end gap-3 pt-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tipo de cálculo</Label>
                          <Select
                            value={row.calculation_type}
                            onValueChange={(value) => updateRow(index, { calculation_type: value })}
                          >
                            <SelectTrigger className="h-8 w-[190px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="last_business_day">Último día hábil</SelectItem>
                              <SelectItem value="business_days_after">Días hábiles después</SelectItem>
                              <SelectItem value="fixed_day">Día fijo del mes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`${row.tax_type}-days`} className="text-xs text-muted-foreground">Días</Label>
                          <Input
                            id={`${row.tax_type}-days`}
                            type="number"
                            min={1}
                            max={31}
                            value={row.days_value ?? ""}
                            onChange={(e) => updateRow(index, { days_value: parseInt(e.target.value, 10) || 0 })}
                            className="h-8 w-20 text-center"
                            disabled={row.calculation_type === "last_business_day"}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Referencia</Label>
                          <Select
                            value={row.reference_period}
                            onValueChange={(value) => updateRow(index, { reference_period: value })}
                          >
                            <SelectTrigger className="h-8 w-[220px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="current_month">Mes actual</SelectItem>
                              <SelectItem value="next_month">Mes siguiente al período</SelectItem>
                              <SelectItem value="quarter_end_next_month">Mes siguiente al trimestre</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2 pb-1.5">
                          <Switch
                            id={`${row.tax_type}-holidays`}
                            checked={row.consider_holidays}
                            onCheckedChange={(checked) => updateRow(index, { consider_holidays: checked })}
                          />
                          <Label htmlFor={`${row.tax_type}-holidays`} className="text-xs text-muted-foreground">
                            Considera feriados
                          </Label>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {rowErrors && rowErrors.length > 0 && (
                    <p className="text-xs text-destructive">{rowErrors.join(". ")}</p>
                  )}
                </div>
              </div>
            );
          })}

          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar impuesto
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeCount} impuesto{activeCount !== 1 ? "s" : ""} activo{activeCount !== 1 ? "s" : ""}
        </p>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Guardar Configuración
        </Button>
      </div>
    </div>
  );
}

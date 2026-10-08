import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Save, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EnterpriseIssuanceProfiles } from "@/components/empresas/EnterpriseIssuanceProfiles";
import { EnterpriseTaxForms } from "@/components/empresas/EnterpriseTaxForms";
import { describeValidity, isValidityRangeOk } from "@/utils/taxConfigValidity";
import { hasValidityColumns } from "@/utils/taxConfigValidityColumns";
import { DEFAULT_TAXES } from "@/constants/taxDueDateDefaults";

interface EnterpriseTaxesProps {
  enterpriseId: number;
}

interface TaxConfig {
  id?: number;
  tax_type: string;
  tax_label: string;
  calculation_type: string;
  days_value: number | null;
  reference_period: string;
  consider_holidays: boolean;
  is_active: boolean;
  /** Vigencia ('YYYY-MM-DD'); null = sin límite. */
  effective_from?: string | null;
  effective_to?: string | null;
}

const CALCULATION_TYPE_LABELS: Record<string, string> = {
  last_business_day: "Último día hábil del mes",
  business_days_after: "Días hábiles después",
  fixed_day: "Día fijo del mes",
};

const REFERENCE_PERIOD_LABELS: Record<string, string> = {
  current_month: "del período",
  next_month: "del mes siguiente al período",
  quarter_end_next_month: "del mes siguiente al trimestre",
};

export function EnterpriseTaxes({ enterpriseId }: EnterpriseTaxesProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxes, setTaxes] = useState<TaxConfig[]>([]);
  // Columnas de vigencia disponibles (migración aplicada).
  const [withValidity, setWithValidity] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetchTaxConfigs();
  }, [enterpriseId]);

  const fetchTaxConfigs = async () => {
    try {
      setLoading(true);
      const [columnsOk, { data, error }] = await Promise.all([
        hasValidityColumns('tab_tax_due_date_config'),
        supabase
          .from('tab_tax_due_date_config')
          .select('*')
          .eq('enterprise_id', enterpriseId),
      ]);

      if (error) throw error;
      setWithValidity(columnsOk);

      if (data && data.length > 0) {
        // "*" trae effective_from/effective_to cuando existen.
        const rows = data as unknown as Array<(typeof data)[number] & {
          effective_from?: string | null; effective_to?: string | null;
        }>;
        setTaxes(rows.map(item => ({
          id: item.id,
          tax_type: item.tax_type,
          tax_label: item.tax_label,
          calculation_type: item.calculation_type,
          days_value: item.days_value,
          reference_period: item.reference_period,
          consider_holidays: item.consider_holidays ?? true,
          is_active: item.is_active ?? true,
          effective_from: item.effective_from ?? null,
          effective_to: item.effective_to ?? null,
        })));
      } else {
        // Use default configuration if none exists
        setTaxes(DEFAULT_TAXES);
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
  };

  const handleToggleTax = (taxType: string) => {
    setTaxes(prev => prev.map(tax => 
      tax.tax_type === taxType 
        ? { ...tax, is_active: !tax.is_active }
        : tax
    ));
  };

  const handleValidityChange = (taxType: string, field: 'effective_from' | 'effective_to', value: string) => {
    setTaxes(prev => prev.map(tax =>
      tax.tax_type === taxType ? { ...tax, [field]: value || null } : tax
    ));
  };

  const handleSave = async () => {
    // Validar ANTES de borrar: "Hasta" no puede ser anterior a "Vigente desde".
    if (withValidity) {
      const invalid = taxes.find(t => t.is_active && !isValidityRangeOk(t));
      if (invalid) {
        toast({
          variant: "destructive",
          title: "Vigencia inválida",
          description: `${invalid.tax_label}: "Hasta" no puede ser anterior a "Vigente desde".`,
        });
        return;
      }
    }

    try {
      setSaving(true);

      // Delete existing configs for this enterprise
      await supabase
        .from('tab_tax_due_date_config')
        .delete()
        .eq('enterprise_id', enterpriseId);

      // Insert all tax configs
      const configsToInsert = taxes.map((tax, index) => ({
        enterprise_id: enterpriseId,
        tax_type: tax.tax_type,
        tax_label: tax.tax_label,
        calculation_type: tax.calculation_type,
        days_value: tax.days_value,
        reference_period: tax.reference_period,
        consider_holidays: tax.consider_holidays,
        is_active: tax.is_active,
        display_order: index + 1,
        // El guardado borra e inserta: la vigencia debe ir en el INSERT para no perderse.
        ...(withValidity
          ? { effective_from: tax.effective_from ?? null, effective_to: tax.effective_to ?? null }
          : {}),
      }));

      // Conversión explícita: los tipos generados aún no incluyen effective_from/effective_to.
      const { error } = await supabase
        .from('tab_tax_due_date_config')
        .insert(configsToInsert as unknown as TablesInsert<'tab_tax_due_date_config'>[]);

      if (error) throw error;

      toast({
        title: "Configuración guardada",
        description: "Los impuestos de la empresa se actualizaron correctamente",
      });

      // Dispatch event for EnterpriseCard to refresh
      window.dispatchEvent(new CustomEvent("taxesChanged", {
        detail: { enterpriseId }
      }));
      queryClient.invalidateQueries({ queryKey: ["dashboard-tax-data", enterpriseId] });

      // Refetch to get the new IDs
      fetchTaxConfigs();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const getVencimientoDescription = (tax: TaxConfig): string => {
    let desc = CALCULATION_TYPE_LABELS[tax.calculation_type] || tax.calculation_type;
    
    if (tax.calculation_type === 'dias_habiles_despues' && tax.days_value) {
      desc = `${tax.days_value} días hábiles`;
    } else if (tax.calculation_type === 'dia_fijo' && tax.days_value) {
      desc = `Día ${tax.days_value}`;
    }
    
    desc += ` ${REFERENCE_PERIOD_LABELS[tax.reference_period] || ''}`;
    
    return desc;
  };

  const activeTaxesCount = taxes.filter(t => t.is_active).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <EnterpriseIssuanceProfiles enterpriseId={enterpriseId} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vencimientos y alertas</CardTitle>
          <CardDescription>
            Define de qué impuestos se generan alertas de vencimiento. Los formularios que ofrece el Generador de
            Declaraciones se definen en 'Formularios de declaración'.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {taxes.map((tax) => (
            <div 
              key={tax.tax_type}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                tax.is_active ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'
              }`}
            >
              <Checkbox
                id={tax.tax_type}
                checked={tax.is_active}
                onCheckedChange={() => handleToggleTax(tax.tax_type)}
                className="mt-0.5"
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Label 
                    htmlFor={tax.tax_type} 
                    className={`font-medium cursor-pointer ${
                      tax.is_active ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {tax.tax_label}
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-sm">
                          Vencimiento: {getVencimientoDescription(tax)}
                          {tax.consider_holidays && " (considera días feriados)"}
                        </p>
                        {tax.tax_type === 'isr_mensual' && (
                          <p className="text-sm mt-1">
                            Es el vencimiento de las retenciones, no el ISR de opción simplificada (5%/7%); ese
                            formulario se configura en 'Formularios de declaración'.
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getVencimientoDescription(tax)}
                </p>
                {tax.is_active && withValidity && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <div className="flex items-center gap-1">
                      <Label htmlFor={`${tax.tax_type}-from`} className="text-xs text-muted-foreground">Vigente desde</Label>
                      <Input
                        id={`${tax.tax_type}-from`}
                        type="date"
                        value={tax.effective_from ?? ""}
                        onChange={(e) => handleValidityChange(tax.tax_type, 'effective_from', e.target.value)}
                        className="h-8 w-40"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label htmlFor={`${tax.tax_type}-to`} className="text-xs text-muted-foreground">Hasta</Label>
                      <Input
                        id={`${tax.tax_type}-to`}
                        type="date"
                        value={tax.effective_to ?? ""}
                        onChange={(e) => handleValidityChange(tax.tax_type, 'effective_to', e.target.value)}
                        className="h-8 w-40"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{describeValidity(tax)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {activeTaxesCount} impuesto{activeTaxesCount !== 1 ? 's' : ''} activo{activeTaxesCount !== 1 ? 's' : ''}
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

      <EnterpriseTaxForms enterpriseId={enterpriseId} />
    </div>
  );
}

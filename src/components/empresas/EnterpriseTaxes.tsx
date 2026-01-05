import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
}

// Default tax configurations for Guatemala
const DEFAULT_TAXES: Omit<TaxConfig, 'id'>[] = [
  {
    tax_type: "iva_mensual",
    tax_label: "IVA Mensual",
    calculation_type: "ultimo_dia_habil",
    days_value: null,
    reference_period: "mes_actual",
    consider_holidays: true,
    is_active: true,
  },
  {
    tax_type: "isr_trimestral",
    tax_label: "ISR Trimestral",
    calculation_type: "ultimo_dia_habil",
    days_value: null,
    reference_period: "mes_siguiente",
    consider_holidays: true,
    is_active: true,
  },
  {
    tax_type: "iso_trimestral",
    tax_label: "ISO Trimestral",
    calculation_type: "ultimo_dia_habil",
    days_value: null,
    reference_period: "mes_actual",
    consider_holidays: true,
    is_active: false,
  },
  {
    tax_type: "retencion_isr",
    tax_label: "Retención ISR",
    calculation_type: "dias_habiles_despues",
    days_value: 10,
    reference_period: "mes_siguiente",
    consider_holidays: true,
    is_active: false,
  },
  {
    tax_type: "retencion_iva",
    tax_label: "Retención IVA",
    calculation_type: "dias_habiles_despues",
    days_value: 15,
    reference_period: "mes_siguiente",
    consider_holidays: true,
    is_active: false,
  },
  {
    tax_type: "isr_anual",
    tax_label: "ISR Anual",
    calculation_type: "dia_fijo",
    days_value: 31,
    reference_period: "mes_siguiente",
    consider_holidays: true,
    is_active: false,
  },
];

const CALCULATION_TYPE_LABELS: Record<string, string> = {
  ultimo_dia_habil: "Último día hábil del mes",
  dias_habiles_despues: "Días hábiles después",
  dia_fijo: "Día fijo del mes",
};

const REFERENCE_PERIOD_LABELS: Record<string, string> = {
  mes_actual: "del período",
  mes_siguiente: "del mes siguiente al período",
};

export function EnterpriseTaxes({ enterpriseId }: EnterpriseTaxesProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [taxes, setTaxes] = useState<TaxConfig[]>([]);

  useEffect(() => {
    fetchTaxConfigs();
  }, [enterpriseId]);

  const fetchTaxConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('tab_tax_due_date_config')
        .select('*')
        .eq('enterprise_id', enterpriseId);

      if (error) throw error;

      if (data && data.length > 0) {
        setTaxes(data.map(item => ({
          id: item.id,
          tax_type: item.tax_type,
          tax_label: item.tax_label,
          calculation_type: item.calculation_type,
          days_value: item.days_value,
          reference_period: item.reference_period,
          consider_holidays: item.consider_holidays ?? true,
          is_active: item.is_active ?? true,
        })));
      } else {
        // Use default configuration if none exists
        setTaxes(DEFAULT_TAXES);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al cargar configuración",
        description: error.message,
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

  const handleSave = async () => {
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
      }));

      const { error } = await supabase
        .from('tab_tax_due_date_config')
        .insert(configsToInsert);

      if (error) throw error;

      toast({
        title: "Configuración guardada",
        description: "Los impuestos de la empresa se actualizaron correctamente",
      });

      // Refetch to get the new IDs
      fetchTaxConfigs();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: error.message,
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Impuestos Aplicables</CardTitle>
          <CardDescription>
            Selecciona los impuestos a los que está sujeta esta empresa. 
            Solo se generarán alertas de vencimiento para los impuestos activos.
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
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getVencimientoDescription(tax)}
                </p>
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
    </div>
  );
}

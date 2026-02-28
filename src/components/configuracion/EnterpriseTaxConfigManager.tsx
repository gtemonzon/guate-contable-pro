import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusActionButton, StatusBadge } from "@/components/ui/status-action-button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { TaxFormType } from "@/hooks/useDeclaracionCalculo";

interface TaxConfig {
  id?: number;
  tax_form_type: TaxFormType;
  tax_rate: number;
  is_active: boolean;
}

const TAX_FORM_OPTIONS: { value: TaxFormType; label: string; defaultRate: number }[] = [
  { value: 'IVA_PEQUENO', label: 'IVA Pequeño Contribuyente (SAT-2046)', defaultRate: 5 },
  { value: 'IVA_GENERAL', label: 'IVA Régimen General (SAT-2237)', defaultRate: 12 },
  { value: 'ISR_MENSUAL', label: 'ISR Opción Mensual (SAT-1311)', defaultRate: 5 },
  { value: 'ISR_TRIMESTRAL', label: 'ISR Trimestral (SAT-1341)', defaultRate: 25 },
];

export function EnterpriseTaxConfigManager() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const [configs, setConfigs] = useState<TaxConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Load active enterprise
  useEffect(() => {
    const stored = localStorage.getItem("currentEnterpriseId");
    if (stored) {
      setEnterpriseId(parseInt(stored, 10));
    }
    setLoading(false);
  }, []);

  // Load configs when enterprise changes
  useEffect(() => {
    if (!enterpriseId) return;

    const fetchConfigs = async () => {
      const { data, error } = await supabase
        .from("tab_enterprise_tax_config")
        .select("*")
        .eq("enterprise_id", enterpriseId);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }

      setConfigs((data || []) as TaxConfig[]);
    };

    fetchConfigs();
  }, [enterpriseId, toast]);

  const addConfig = () => {
    // Find first unused tax form type
    const usedTypes = configs.map(c => c.tax_form_type);
    const availableType = TAX_FORM_OPTIONS.find(o => !usedTypes.includes(o.value));
    
    if (!availableType) {
      toast({ title: "Aviso", description: "Ya tienes todos los tipos de formulario configurados" });
      return;
    }

    setConfigs([...configs, {
      tax_form_type: availableType.value,
      tax_rate: availableType.defaultRate,
      is_active: true,
    }]);
  };

  const updateConfig = (index: number, field: keyof TaxConfig, value: any) => {
    const updated = [...configs];
    updated[index] = { ...updated[index], [field]: value };
    
    // Update default rate when changing form type
    if (field === 'tax_form_type') {
      const option = TAX_FORM_OPTIONS.find(o => o.value === value);
      if (option) {
        updated[index].tax_rate = option.defaultRate;
      }
    }
    
    setConfigs(updated);
  };

  const removeConfig = async (index: number) => {
    const config = configs[index];
    if (config.id) {
      const { error } = await supabase
        .from("tab_enterprise_tax_config")
        .delete()
        .eq("id", config.id);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        return;
      }
    }

    const updated = configs.filter((_, i) => i !== index);
    setConfigs(updated);
    toast({ title: "Eliminado", description: "Configuración eliminada" });
  };

  const saveConfigs = async () => {
    if (!enterpriseId) return;

    setSaving(true);
    try {
      for (const config of configs) {
        if (config.id) {
          // Update existing
          await supabase
            .from("tab_enterprise_tax_config")
            .update({
              tax_form_type: config.tax_form_type,
              tax_rate: config.tax_rate,
              is_active: config.is_active,
            })
            .eq("id", config.id);
        } else {
          // Insert new
          const { data, error } = await supabase
            .from("tab_enterprise_tax_config")
            .insert({
              enterprise_id: enterpriseId,
              tax_form_type: config.tax_form_type,
              tax_rate: config.tax_rate,
              is_active: config.is_active,
            })
            .select()
            .single();

          if (error) throw error;
          config.id = data.id;
        }
      }

      toast({ title: "Guardado", description: "Configuración de impuestos guardada correctamente" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Selecciona una empresa activa para configurar los formularios de impuestos
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Formularios de Impuestos</CardTitle>
        <CardDescription>
          Configura los tipos de formularios SAT que usa esta empresa y sus tasas aplicables
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {configs.map((config, index) => (
          <div key={index} className="flex items-end gap-4 p-4 border rounded-lg bg-muted/30">
            <div className="flex-1 space-y-2">
              <Label>Tipo de Formulario</Label>
              <Select
                value={config.tax_form_type}
                onValueChange={(value) => updateConfig(index, 'tax_form_type', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAX_FORM_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-32 space-y-2">
              <Label>Tasa (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={config.tax_rate}
                onChange={(e) => updateConfig(index, 'tax_rate', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge isActive={config.is_active} />
              <StatusActionButton
                isActive={config.is_active}
                onToggle={() => updateConfig(index, 'is_active', !config.is_active)}
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeConfig(index)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}

        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={addConfig} className="gap-2">
            <Plus className="h-4 w-4" />
            Agregar Formulario
          </Button>
          <Button onClick={saveConfigs} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Guardar Configuración
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

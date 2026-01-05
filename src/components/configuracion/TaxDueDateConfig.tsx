import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { getDefaultTaxConfigs, type TaxDueDateConfig as TaxDueDateConfigType } from '@/utils/dueDateCalculations';

interface TaxConfigRow extends TaxDueDateConfigType {
  id?: number;
}

const calculationTypeLabels: Record<string, string> = {
  'last_business_day': 'Último día hábil',
  'business_days_after': 'Días hábiles después',
  'fixed_day': 'Día fijo del mes',
};

const referencePeriodLabels: Record<string, string> = {
  'current_month': 'Mes actual',
  'next_month': 'Mes siguiente',
  'quarter_end_next_month': 'Mes siguiente al trimestre',
};

export function TaxDueDateConfig() {
  const [configs, setConfigs] = useState<TaxConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const enterpriseId = localStorage.getItem('currentEnterpriseId');

  useEffect(() => {
    const fetchConfigs = async () => {
      if (!enterpriseId) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('tab_tax_due_date_config')
          .select('*')
          .eq('enterprise_id', parseInt(enterpriseId))
          .order('display_order');

        if (data && data.length > 0) {
          setConfigs(data.map((c: any) => ({
            id: c.id,
            tax_type: c.tax_type,
            tax_label: c.tax_label,
            calculation_type: c.calculation_type,
            days_value: c.days_value,
            reference_period: c.reference_period,
            consider_holidays: c.consider_holidays,
            is_active: c.is_active,
          })));
        } else {
          // Load defaults if no config exists
          setConfigs(getDefaultTaxConfigs().map((c, i) => ({
            ...c,
            is_active: true,
          })));
        }
      } catch (error) {
        console.error('Error fetching tax configs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfigs();
  }, [enterpriseId]);

  const handleUpdate = (index: number, field: keyof TaxConfigRow, value: any) => {
    setConfigs(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const handleSave = async () => {
    if (!enterpriseId) return;

    setSaving(true);
    try {
      // Delete existing configs
      await supabase
        .from('tab_tax_due_date_config')
        .delete()
        .eq('enterprise_id', parseInt(enterpriseId));

      // Insert new configs
      const toInsert = configs.map((c, i) => ({
        enterprise_id: parseInt(enterpriseId),
        tax_type: c.tax_type,
        tax_label: c.tax_label,
        calculation_type: c.calculation_type,
        days_value: c.days_value,
        reference_period: c.reference_period,
        consider_holidays: c.consider_holidays,
        is_active: c.is_active,
        display_order: i,
      }));

      const { error } = await supabase
        .from('tab_tax_due_date_config')
        .insert(toInsert);

      if (error) throw error;

      toast({
        title: 'Configuración guardada',
        description: 'Las fechas de vencimiento se han actualizado.',
      });
    } catch (error) {
      console.error('Error saving tax configs:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const addNewTax = () => {
    setConfigs(prev => [...prev, {
      tax_type: `custom_${Date.now()}`,
      tax_label: 'Nuevo Impuesto',
      calculation_type: 'last_business_day',
      days_value: 0,
      reference_period: 'current_month',
      consider_holidays: true,
      is_active: true,
    }]);
  };

  const removeTax = (index: number) => {
    setConfigs(prev => prev.filter((_, i) => i !== index));
  };

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Selecciona una empresa para configurar las fechas de vencimiento.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fechas de Vencimiento de Impuestos</CardTitle>
        <CardDescription>
          Configura cómo se calculan las fechas de vencimiento para cada tipo de impuesto según las reglas guatemaltecas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Impuesto</TableHead>
                <TableHead>Tipo de Cálculo</TableHead>
                <TableHead className="w-[80px]">Días</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="w-[80px] text-center">Feriados</TableHead>
                <TableHead className="w-[80px] text-center">Activo</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config, index) => (
                <TableRow key={config.tax_type}>
                  <TableCell>
                    <Input
                      value={config.tax_label}
                      onChange={(e) => handleUpdate(index, 'tax_label', e.target.value)}
                      className="w-full min-w-[150px]"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={config.calculation_type}
                      onValueChange={(value) => handleUpdate(index, 'calculation_type', value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="last_business_day">Último día hábil</SelectItem>
                        <SelectItem value="business_days_after">Días hábiles después</SelectItem>
                        <SelectItem value="fixed_day">Día fijo del mes</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={31}
                      value={config.days_value}
                      onChange={(e) => handleUpdate(index, 'days_value', parseInt(e.target.value) || 0)}
                      className="w-16 text-center"
                      disabled={config.calculation_type === 'last_business_day'}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={config.reference_period}
                      onValueChange={(value) => handleUpdate(index, 'reference_period', value)}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="current_month">Mes actual</SelectItem>
                        <SelectItem value="next_month">Mes siguiente</SelectItem>
                        <SelectItem value="quarter_end_next_month">Mes sig. trimestre</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={config.consider_holidays}
                      onCheckedChange={(checked) => handleUpdate(index, 'consider_holidays', checked)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={(checked) => handleUpdate(index, 'is_active', checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTax(index)}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={addNewTax}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar Impuesto
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Configuración
              </>
            )}
          </Button>
        </div>

        <div className="mt-6 p-4 bg-muted rounded-lg space-y-2">
          <p className="text-sm font-medium">Guía de configuración:</p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li><strong>Último día hábil:</strong> IVA, ISR Trimestral, ISO (vencen el último día hábil del mes)</li>
            <li><strong>Días hábiles después:</strong> Retenciones ISR/IVA (10 días hábiles del mes siguiente)</li>
            <li><strong>Día fijo:</strong> Para impuestos con fecha específica</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

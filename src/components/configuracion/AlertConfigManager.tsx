import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save } from 'lucide-react';

interface AlertConfigItem {
  alert_type: string;
  label: string;
  description: string;
  is_enabled: boolean;
  days_before: number;
  send_email: boolean;
}

const defaultAlertTypes: Omit<AlertConfigItem, 'is_enabled' | 'days_before' | 'send_email'>[] = [
  { alert_type: 'vencimiento_iva', label: 'Vencimiento IVA', description: 'Alerta antes del vencimiento de IVA mensual' },
  { alert_type: 'vencimiento_isr_trimestral', label: 'Vencimiento ISR Trimestral', description: 'Alerta antes del vencimiento de ISR trimestral' },
  { alert_type: 'vencimiento_iso', label: 'Vencimiento ISO', description: 'Alerta antes del vencimiento de ISO trimestral' },
  { alert_type: 'vencimiento_isr_mensual', label: 'Vencimiento ISR Mensual', description: 'Alerta antes del vencimiento de retenciones ISR' },
  { alert_type: 'vencimiento_retenciones_iva', label: 'Vencimiento Retención IVA', description: 'Alerta antes del vencimiento de retenciones IVA' },
  { alert_type: 'vencimiento_retenciones_isr', label: 'Vencimiento Retención ISR', description: 'Alerta antes del vencimiento de retenciones ISR' },
  { alert_type: 'periodo_pendiente', label: 'Períodos Pendientes', description: 'Alerta cuando hay períodos contables sin cerrar' },
  { alert_type: 'partida_borrador', label: 'Partidas en Borrador', description: 'Alerta cuando hay partidas sin contabilizar por varios días' },
  { alert_type: 'conciliacion_pendiente', label: 'Conciliación Pendiente', description: 'Alerta cuando hay movimientos bancarios sin conciliar' },
];

export function AlertConfigManager() {
  const [configs, setConfigs] = useState<AlertConfigItem[]>([]);
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
          .from('tab_alert_config')
          .select('*')
          .eq('enterprise_id', parseInt(enterpriseId));

        const configMap = new Map((data || []).map((c: any) => [c.alert_type, c]));

        const mergedConfigs = defaultAlertTypes.map(type => {
          const saved = configMap.get(type.alert_type);
          return {
            ...type,
            is_enabled: saved?.is_enabled ?? true,
            days_before: saved?.days_before ?? 5,
            send_email: saved?.send_email ?? false,
          };
        });

        setConfigs(mergedConfigs);
      } catch (error) {
        console.error('Error fetching alert configs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfigs();
  }, [enterpriseId]);

  const handleToggle = (alertType: string, field: 'is_enabled' | 'send_email') => {
    setConfigs(prev =>
      prev.map(c => c.alert_type === alertType ? { ...c, [field]: !c[field] } : c)
    );
  };

  const handleDaysChange = (alertType: string, value: string) => {
    const days = parseInt(value) || 0;
    setConfigs(prev =>
      prev.map(c => c.alert_type === alertType ? { ...c, days_before: Math.max(1, Math.min(30, days)) } : c)
    );
  };

  const handleSave = async () => {
    if (!enterpriseId) return;

    setSaving(true);
    try {
      for (const config of configs) {
        await supabase
          .from('tab_alert_config')
          .upsert({
            enterprise_id: parseInt(enterpriseId),
            alert_type: config.alert_type,
            is_enabled: config.is_enabled,
            days_before: config.days_before,
            send_email: config.send_email,
          }, {
            onConflict: 'enterprise_id,alert_type'
          });
      }

      toast({
        title: 'Configuración guardada',
        description: 'Las preferencias de alertas se han actualizado.',
      });
    } catch (error) {
      console.error('Error saving alert configs:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!enterpriseId) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Selecciona una empresa para configurar las alertas.
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
        <CardTitle>Configuración de Alertas</CardTitle>
        <CardDescription>
          Activa o desactiva alertas y configura los días de anticipación para cada tipo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo de Alerta</TableHead>
              <TableHead className="w-[100px] text-center">Activa</TableHead>
              <TableHead className="w-[120px] text-center">Días Antes</TableHead>
              <TableHead className="w-[100px] text-center">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <TableRow key={config.alert_type}>
                <TableCell>
                  <div>
                    <p className="font-medium">{config.label}</p>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={config.is_enabled}
                    onCheckedChange={() => handleToggle(config.alert_type, 'is_enabled')}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={config.days_before}
                    onChange={(e) => handleDaysChange(config.alert_type, e.target.value)}
                    className="w-16 text-center mx-auto"
                    disabled={!config.is_enabled}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={config.send_email}
                    onCheckedChange={() => handleToggle(config.alert_type, 'send_email')}
                    disabled={!config.is_enabled}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="flex justify-end mt-6">
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

        <div className="mt-4 p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground">
            <strong>Nota:</strong> La opción de notificaciones por email estará disponible próximamente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

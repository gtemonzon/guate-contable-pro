import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";

export function CollectionSettingsManager() {
  const { currentEnterprise } = useTenant();
  const enterpriseId = currentEnterprise?.id;
  const [adjust, setAdjust] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (!enterpriseId) return;
      setLoading(true);
      const { data } = await supabase
        .from("tab_collection_settings")
        .select("adjust_to_business_days")
        .eq("enterprise_id", enterpriseId)
        .maybeSingle();
      setAdjust(!!(data as any)?.adjust_to_business_days);
      setLoading(false);
    })();
  }, [enterpriseId]);

  const save = async (next: boolean) => {
    if (!enterpriseId) return;
    setSaving(true);
    setAdjust(next);
    const { error } = await supabase.from("tab_collection_settings").upsert({
      enterprise_id: enterpriseId,
      adjust_to_business_days: next,
    } as any, { onConflict: "enterprise_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setAdjust(!next);
      return;
    }
    toast({ title: "Ajustes guardados" });
  };

  if (!enterpriseId) {
    return <Card><CardContent className="p-6 text-center text-muted-foreground">Selecciona una empresa.</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes de Cobros y Pagos</CardTitle>
        <CardDescription>Preferencias generales para el cálculo de vencimientos.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="flex items-start justify-between gap-4 rounded border p-4">
            <div className="space-y-1">
              <Label htmlFor="adjust-bd" className="text-sm font-medium">
                Ajustar automáticamente los vencimientos a días hábiles
              </Label>
              <p className="text-xs text-muted-foreground">
                Si un vencimiento cae en sábado, domingo o feriado, se corre al siguiente día hábil.
                Usa el calendario de feriados ya configurado en Tributario → Fechas de Vencimiento.
              </p>
            </div>
            <Switch id="adjust-bd" checked={adjust} onCheckedChange={save} disabled={saving} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

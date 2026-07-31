import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";

/** Generic ERP module catalog — add new entries here to expose more per-enterprise switches. */
const ENTERPRISE_MODULES: { module_key: string; label: string; description: string }[] = [
  {
    module_key: "cxc",
    label: "Cuentas por Cobrar",
    description:
      "Generar seguimiento de cobro automáticamente para las facturas nuevas del Libro de Ventas de esta empresa.",
  },
  {
    module_key: "cxp",
    label: "Cuentas por Pagar",
    description:
      "Generar seguimiento de pago automáticamente para las facturas nuevas del Libro de Compras de esta empresa.",
  },
];

function EnterpriseModulesSection({ enterpriseId }: { enterpriseId: number }) {
  const { hasModule } = useTenant();
  const available = ENTERPRISE_MODULES.filter((m) => hasModule(m.module_key));
  const [state, setState] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("tab_enterprise_modules" as any)
        .select("module_key,is_enabled")
        .eq("enterprise_id", enterpriseId);
      if (cancelled) return;
      const next: Record<string, boolean> = {};
      (data as any[] | null)?.forEach((r) => { next[r.module_key] = !!r.is_enabled; });
      setState(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [enterpriseId]);

  const toggle = async (moduleKey: string, next: boolean) => {
    setSavingKey(moduleKey);
    setState((s) => ({ ...s, [moduleKey]: next }));
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("tab_enterprise_modules" as any).upsert(
      {
        enterprise_id: enterpriseId,
        module_key: moduleKey,
        is_enabled: next,
        updated_by: user?.id ?? null,
      } as any,
      { onConflict: "enterprise_id,module_key" },
    );
    setSavingKey(null);
    if (error) {
      setState((s) => ({ ...s, [moduleKey]: !next }));
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: next ? "Módulo activado" : "Módulo desactivado" });
  };

  if (available.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Módulos habilitados en esta empresa</CardTitle>
        <CardDescription>
          Activa por empresa los módulos que tu oficina tiene disponibles. Desactivado por defecto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          available.map((m) => (
            <div key={m.module_key} className="flex items-start justify-between gap-4 rounded border p-4">
              <div className="space-y-1">
                <Label htmlFor={`mod-${m.module_key}`} className="text-sm font-medium">{m.label}</Label>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </div>
              <Switch
                id={`mod-${m.module_key}`}
                checked={!!state[m.module_key]}
                onCheckedChange={(v) => toggle(m.module_key, v)}
                disabled={savingKey === m.module_key}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}



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

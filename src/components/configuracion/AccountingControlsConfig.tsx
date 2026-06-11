import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function AccountingControlsConfig() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const [allowReopen, setAllowReopen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem("currentEnterpriseId");
    if (id) setEnterpriseId(Number(id));
  }, []);

  useEffect(() => {
    if (!enterpriseId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("tab_enterprise_config")
        .select("allow_reopen_posted_entries")
        .eq("enterprise_id", enterpriseId)
        .maybeSingle();
      // @ts-expect-error column added in latest migration
      setAllowReopen(Boolean(data?.allow_reopen_posted_entries));
      setLoading(false);
    })();
  }, [enterpriseId]);

  const handleToggle = async (value: boolean) => {
    if (!enterpriseId) return;
    setSaving(true);
    setAllowReopen(value);
    const { data: existing } = await supabase
      .from("tab_enterprise_config")
      .select("id")
      .eq("enterprise_id", enterpriseId)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      enterprise_id: enterpriseId,
      allow_reopen_posted_entries: value,
    };
    const { error } = existing
      ? await supabase.from("tab_enterprise_config").update(payload).eq("enterprise_id", enterpriseId)
      : await supabase.from("tab_enterprise_config").insert(payload);

    if (error) {
      toast.error("Error al guardar la configuración");
      setAllowReopen(!value);
    } else {
      toast.success("Configuración actualizada");
    }
    setSaving(false);
  };

  if (!enterpriseId) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Selecciona una empresa para configurar los controles contables.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Controles Contables</CardTitle>
        <CardDescription>
          Controles avanzados para el manejo de partidas contables. Estas opciones afectan la trazabilidad,
          por lo que toda acción queda registrada en la bitácora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4 border rounded-lg p-4">
            <div className="space-y-1">
              <Label htmlFor="allow-reopen" className="text-sm font-medium">
                Permitir reapertura de partidas contabilizadas manualmente
              </Label>
              <p className="text-xs text-muted-foreground max-w-xl">
                Cuando está habilitado, los usuarios con permiso de contabilizar pueden devolver una partida
                <strong> creada manualmente</strong> al estado Borrador para corregirla. Las partidas generadas
                automáticamente (compras, ventas, depreciación, diferencial cambiario, apertura, cierre) nunca
                pueden reabrirse. Cada reapertura queda registrada con el motivo en la bitácora.
              </p>
            </div>
            <Switch
              id="allow-reopen"
              checked={allowReopen}
              onCheckedChange={handleToggle}
              disabled={saving}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/TenantContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getSafeErrorMessage } from "@/utils/errorMessages";

const ERP_MODULES: { key: string; label: string; description: string }[] = [
  { key: "cxc", label: "Cuentas por Cobrar", description: "Seguimiento de cobros y antigüedad de saldos" },
  { key: "cxp", label: "Cuentas por Pagar", description: "Seguimiento de pagos y antigüedad de saldos" },
  { key: "inventario", label: "Inventario", description: "Catálogo, kardex y costo promedio ponderado" },
  { key: "tax_avanzada", label: "Gestión Tributaria Avanzada", description: "Herramientas fiscales extendidas" },
];

interface EnterpriseModulesProps {
  enterpriseId: number;
}

export function EnterpriseModules({ enterpriseId }: EnterpriseModulesProps) {
  const { toast } = useToast();
  const { hasModule } = useTenant();
  const [states, setStates] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const visibleModules = ERP_MODULES.filter((m) => hasModule(m.key));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tab_enterprise_modules")
        .select("module_key, is_enabled")
        .eq("enterprise_id", enterpriseId);
      if (error) {
        toast({
          variant: "destructive",
          title: "Error al cargar módulos",
          description: getSafeErrorMessage(error),
        });
      } else {
        const map: Record<string, boolean> = {};
        (data || []).forEach((row) => {
          map[row.module_key] = row.is_enabled;
        });
        setStates(map);
      }
      setLoading(false);
    };
    load();
  }, [enterpriseId, toast]);

  const handleToggle = async (moduleKey: string, enabled: boolean) => {
    setSavingKey(moduleKey);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw userError || new Error("Sesión no válida");

      const { error } = await supabase
        .from("tab_enterprise_modules")
        .upsert(
          {
            enterprise_id: enterpriseId,
            module_key: moduleKey,
            is_enabled: enabled,
            updated_by: user.id,
          },
          { onConflict: "enterprise_id,module_key" }
        );
      if (error) throw error;

      setStates((prev) => ({ ...prev, [moduleKey]: enabled }));
      const label = ERP_MODULES.find((m) => m.key === moduleKey)?.label ?? moduleKey;
      toast({
        title: `${label} ${enabled ? "activado" : "desactivado"}`,
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al guardar",
        description: getSafeErrorMessage(error),
      });
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (visibleModules.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
        Tu oficina no tiene módulos ERP activos. Actívalos primero a nivel de tenant.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Activa o desactiva los módulos ERP disponibles para esta empresa. Los cambios se guardan automáticamente.
      </p>
      {visibleModules.map((m) => (
        <div
          key={m.key}
          className="flex flex-row items-center justify-between rounded-lg border p-4"
        >
          <div className="space-y-0.5">
            <Label htmlFor={`module-${m.key}`} className="text-base">
              {m.label}
            </Label>
            <p className="text-sm text-muted-foreground">{m.description}</p>
          </div>
          <Switch
            id={`module-${m.key}`}
            checked={states[m.key] ?? false}
            disabled={savingKey === m.key}
            onCheckedChange={(checked) => handleToggle(m.key, checked)}
          />
        </div>
      ))}
    </div>
  );
}

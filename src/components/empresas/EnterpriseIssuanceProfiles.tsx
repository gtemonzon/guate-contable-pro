import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Props {
  enterpriseId: number;
}

type Flags = {
  issues_isr_retention_certificates: boolean;
  issues_vat_retention_certificates: boolean;
  issues_vat_exemption_certificates: boolean;
};

export function EnterpriseIssuanceProfiles({ enterpriseId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flags, setFlags] = useState<Flags>({
    issues_isr_retention_certificates: false,
    issues_vat_retention_certificates: false,
    issues_vat_exemption_certificates: false,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("tab_enterprise_config" as never)
        .select("issues_isr_retention_certificates, issues_vat_retention_certificates, issues_vat_exemption_certificates")
        .eq("enterprise_id", enterpriseId)
        .maybeSingle();
      const d = data as Partial<Flags> | null;
      if (d) {
        setFlags({
          issues_isr_retention_certificates: !!d.issues_isr_retention_certificates,
          issues_vat_retention_certificates: !!d.issues_vat_retention_certificates,
          issues_vat_exemption_certificates: !!d.issues_vat_exemption_certificates,
        });
      }
      setLoading(false);
    })();
  }, [enterpriseId]);

  const update = async (key: keyof Flags, value: boolean) => {
    setSaving(true);
    const next = { ...flags, [key]: value };
    setFlags(next);
    const { error } = await supabase
      .from("tab_enterprise_config" as never)
      .update({ [key]: value } as never)
      .eq("enterprise_id", enterpriseId);
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setFlags(flags);
    } else {
      toast({ title: "Actualizado" });
    }
  };

  const items: Array<{ key: keyof Flags; label: string; description: string }> = [
    {
      key: "issues_isr_retention_certificates",
      label: "Emite Constancias de Retención de ISR",
      description: "La empresa puede emitir constancias de retención de ISR a sus proveedores.",
    },
    {
      key: "issues_vat_retention_certificates",
      label: "Emite Constancias de Retención de IVA",
      description: "La empresa puede emitir constancias de retención de IVA (agente retenedor).",
    },
    {
      key: "issues_vat_exemption_certificates",
      label: "Emite Constancias de Exención de IVA",
      description: "La empresa puede emitir constancias de exención de IVA.",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Perfiles Tributarios</CardTitle>
        <CardDescription>
          Controla qué constancias puede <strong>emitir</strong> esta empresa. La recepción de constancias
          siempre está permitida, independientemente de esta configuración.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          items.map((it) => (
            <div key={it.key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor={it.key} className="font-medium cursor-pointer">{it.label}</Label>
                <p className="text-xs text-muted-foreground">{it.description}</p>
              </div>
              <Switch
                id={it.key}
                checked={flags[it.key]}
                disabled={saving}
                onCheckedChange={(v) => update(it.key, v)}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

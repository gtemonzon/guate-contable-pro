import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeValidity, isValidityRangeOk } from "@/utils/taxConfigValidity";
import { hasValidityColumns } from "@/utils/taxConfigValidityColumns";

interface EnterpriseTaxFormsProps {
  enterpriseId: number;
}

/** Formularios de declaración que ofrecen el Generador y las tarjetas del Dashboard. */
const FORM_TYPES = [
  { type: "IVA_GENERAL", label: "IVA General", defaultRate: 12 },
  { type: "IVA_PEQUENO", label: "IVA Pequeño Contribuyente", defaultRate: 5 },
  { type: "ISR_MENSUAL", label: "ISR Mensual (opción simplificada)", defaultRate: 5 },
  { type: "ISR_TRIMESTRAL", label: "ISR Trimestral", defaultRate: 25 },
  { type: "ISO_TRIMESTRAL", label: "ISO Trimestral", defaultRate: 1 },
] as const;

interface FormRow {
  /** Ya existe una fila en tab_enterprise_tax_config (activa o no). */
  exists: boolean;
  applies: boolean;
  rate: string;
  effectiveFrom: string;
  effectiveTo: string;
}

interface DbRow {
  tax_form_type: string;
  tax_rate: number | null;
  is_active: boolean | null;
  effective_from?: string | null;
  effective_to?: string | null;
}

const emptyRows = (): Record<string, FormRow> =>
  Object.fromEntries(FORM_TYPES.map((f) => [f.type, {
    exists: false, applies: false, rate: String(f.defaultRate), effectiveFrom: "", effectiveTo: "",
  }]));

/**
 * Editar Empresa > Impuestos > "Formularios de declaración" (tab_enterprise_tax_config):
 * qué formularios aplican, con su tasa y su vigencia por fechas.
 */
export function EnterpriseTaxForms({ enterpriseId }: EnterpriseTaxFormsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Record<string, FormRow>>(emptyRows);
  const [withValidity, setWithValidity] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [columnsOk, { data, error }] = await Promise.all([
        hasValidityColumns("tab_enterprise_tax_config"),
        supabase.from("tab_enterprise_tax_config").select("*").eq("enterprise_id", enterpriseId),
      ]);
      if (error) throw error;
      setWithValidity(columnsOk);
      const next = emptyRows();
      for (const r of (data || []) as unknown as DbRow[]) {
        if (!next[r.tax_form_type]) continue;
        next[r.tax_form_type] = {
          exists: true,
          applies: !!r.is_active,
          rate: r.tax_rate != null ? String(r.tax_rate) : next[r.tax_form_type].rate,
          effectiveFrom: r.effective_from ?? "",
          effectiveTo: r.effective_to ?? "",
        };
      }
      setRows(next);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al cargar formularios",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterpriseId]);

  const update = (type: string, patch: Partial<FormRow>) =>
    setRows((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const handleSave = async () => {
    // Validaciones (antes de escribir nada).
    for (const f of FORM_TYPES) {
      const r = rows[f.type];
      if (!r.exists && !r.applies) continue;
      const rate = Number(r.rate);
      if (r.rate.trim() === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
        toast({ variant: "destructive", title: "Tasa inválida", description: `${f.label}: la tasa debe estar entre 0 y 100.` });
        return;
      }
      if (withValidity && !isValidityRangeOk({ effective_from: r.effectiveFrom || null, effective_to: r.effectiveTo || null })) {
        toast({ variant: "destructive", title: "Vigencia inválida", description: `${f.label}: "Hasta" no puede ser anterior a "Vigente desde".` });
        return;
      }
    }

    // Upsert por (enterprise_id, tax_form_type). Desmarcar "Aplica" desactiva (no borra);
    // un tipo nunca configurado no crea fila hasta que se marque.
    const payload = FORM_TYPES
      .filter((f) => rows[f.type].exists || rows[f.type].applies)
      .map((f) => {
        const r = rows[f.type];
        return {
          enterprise_id: enterpriseId,
          tax_form_type: f.type,
          tax_rate: Number(r.rate),
          is_active: r.applies,
          ...(withValidity
            ? { effective_from: r.effectiveFrom || null, effective_to: r.effectiveTo || null }
            : {}),
        };
      });
    if (payload.length === 0) {
      toast({ title: "Sin cambios", description: "No hay formularios marcados." });
      return;
    }

    try {
      setSaving(true);
      // Conversión explícita: los tipos generados aún no incluyen effective_from/effective_to.
      const { error } = await supabase
        .from("tab_enterprise_tax_config")
        .upsert(payload as unknown as TablesInsert<"tab_enterprise_tax_config">[], {
          onConflict: "enterprise_id,tax_form_type",
        });
      if (error) throw error;

      toast({ title: "Formularios guardados", description: "Los formularios de declaración se actualizaron correctamente" });
      window.dispatchEvent(new CustomEvent("taxesChanged", { detail: { enterpriseId } }));
      queryClient.invalidateQueries({ queryKey: ["dashboard-tax-data", enterpriseId] });
      load();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Formularios de declaración</CardTitle>
        <CardDescription>
          Formularios que ofrece el Generador de Declaraciones y que muestran las tarjetas del Dashboard, con su
          tasa y su vigencia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          El tipo de IVA (General o Pequeño Contribuyente) lo decide el Historial de Régimen Fiscal; aquí se define
          la tasa y la vigencia.
        </p>
        {!withValidity && (
          <p className="text-xs text-warning">
            Las fechas de vigencia estarán disponibles cuando se aplique la actualización de la base de datos.
          </p>
        )}
        {FORM_TYPES.map((f) => {
          const r = rows[f.type];
          const id = `taxform-${f.type}`;
          return (
            <div
              key={f.type}
              className={`space-y-2 p-3 rounded-lg border transition-colors ${
                r.applies ? "bg-primary/5 border-primary/20" : "bg-muted/30"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 min-w-[14rem]">
                  <Checkbox id={id} checked={r.applies} onCheckedChange={(v) => update(f.type, { applies: v === true })} />
                  <Label htmlFor={id} className={`font-medium cursor-pointer ${r.applies ? "" : "text-muted-foreground"}`}>
                    {f.label}
                  </Label>
                  <span className="text-xs text-muted-foreground">Aplica</span>
                </div>
                <div className="flex items-center gap-1">
                  <Label htmlFor={`${id}-rate`} className="text-xs text-muted-foreground">Tasa %</Label>
                  <Input
                    id={`${id}-rate`}
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={r.rate}
                    onChange={(e) => update(f.type, { rate: e.target.value })}
                    className="h-8 w-20 text-right"
                  />
                </div>
                {withValidity && (
                  <>
                    <div className="flex items-center gap-1">
                      <Label htmlFor={`${id}-from`} className="text-xs text-muted-foreground">Vigente desde</Label>
                      <Input
                        id={`${id}-from`}
                        type="date"
                        value={r.effectiveFrom}
                        onChange={(e) => update(f.type, { effectiveFrom: e.target.value })}
                        className="h-8 w-40"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label htmlFor={`${id}-to`} className="text-xs text-muted-foreground">Hasta</Label>
                      <Input
                        id={`${id}-to`}
                        type="date"
                        value={r.effectiveTo}
                        onChange={(e) => update(f.type, { effectiveTo: e.target.value })}
                        className="h-8 w-40"
                      />
                    </div>
                  </>
                )}
              </div>
              {(r.exists || r.applies) && withValidity && (
                <p className="text-xs text-muted-foreground">
                  {describeValidity({ effective_from: r.effectiveFrom || null, effective_to: r.effectiveTo || null })}
                </p>
              )}
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar formularios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

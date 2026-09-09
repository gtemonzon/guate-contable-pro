import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { listFiscalBookStrategies, getFiscalBookStrategy } from "@/services/fiscalBookStrategy";

interface RegimeHistoryEntry {
  id: number;
  tax_regime: string;
  effective_from: string;
}

interface EnterpriseTaxRegimeHistoryProps {
  enterpriseId: number;
  onSuccess: () => void;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function nextMonthFirstDay(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
}

export function EnterpriseTaxRegimeHistory({ enterpriseId, onSuccess }: EnterpriseTaxRegimeHistoryProps) {
  const { toast } = useToast();
  const [history, setHistory] = useState<RegimeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRegime, setNewRegime] = useState<string>("contribuyente_general");
  const [newEffectiveFrom, setNewEffectiveFrom] = useState<string>(nextMonthFirstDay());

  const fetchHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tab_enterprise_tax_regime_history")
      .select("id, tax_regime, effective_from")
      .eq("enterprise_id", enterpriseId)
      .order("effective_from", { ascending: false });
    if (!error && data) setHistory(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enterpriseId]);

  const latestEffectiveFrom = history[0]?.effective_from ?? null;

  const openDialog = () => {
    setNewRegime("contribuyente_general");
    setNewEffectiveFrom(nextMonthFirstDay());
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!newEffectiveFrom) {
      toast({ variant: "destructive", title: "Fecha requerida", description: "Indica la fecha de vigencia." });
      return;
    }
    if (latestEffectiveFrom && newEffectiveFrom <= latestEffectiveFrom) {
      toast({
        variant: "destructive",
        title: "Fecha inválida",
        description: `La fecha de vigencia debe ser posterior a ${latestEffectiveFrom} (el cambio de régimen más reciente registrado). No se permiten cambios retroactivos entre fechas ya registradas.`,
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insertError } = await supabase
        .from("tab_enterprise_tax_regime_history")
        .insert({
          enterprise_id: enterpriseId,
          tax_regime: newRegime,
          effective_from: newEffectiveFrom,
          created_by: user?.id ?? null,
        });
      if (insertError) throw insertError;

      const appliesNow = newEffectiveFrom <= todayStr();
      if (appliesNow) {
        const { error: updateError } = await supabase
          .from("tab_enterprises")
          .update({ tax_regime: newRegime })
          .eq("id", enterpriseId);
        if (updateError) throw updateError;
      }

      toast({
        title: "Cambio de régimen registrado",
        description: appliesNow
          ? "El régimen actual de la empresa se actualizó."
          : `Este cambio aplicará automáticamente a partir de ${newEffectiveFrom} — el campo de régimen actual se actualizará manualmente cuando corresponda.`,
      });

      setDialogOpen(false);
      await fetchHistory();
      onSuccess();
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Error al registrar el cambio",
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <History className="h-4 w-4" /> Historial de Régimen Fiscal
          </h3>
          <p className="text-sm text-muted-foreground">
            Registra cada cambio de régimen fiscal con su fecha de vigencia, para que los libros y reportes de
            meses pasados reflejen el régimen que realmente aplicaba en ese momento.
          </p>
        </div>
        <Button size="sm" onClick={openDialog} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" /> Registrar cambio
        </Button>
      </div>

      <div className="space-y-2">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin historial registrado.</p>
        ) : (
          history.map((entry, idx) => (
            <Card key={entry.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium">{getFiscalBookStrategy(entry.tax_regime).label}</p>
                  <p className="text-xs text-muted-foreground">Vigente desde {entry.effective_from}</p>
                </div>
                {idx === 0 && <Badge>Vigente</Badge>}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar cambio de régimen</DialogTitle>
            <DialogDescription>
              El nuevo régimen aplicará a partir de la fecha de vigencia indicada. Solo se permiten fechas hacia
              adelante, posteriores al cambio más reciente registrado, para no arriesgar recalcular períodos ya
              cerrados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nuevo Régimen</Label>
              <Select value={newRegime} onValueChange={setNewRegime}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {listFiscalBookStrategies().map((s) => (
                    <SelectItem key={s.regime} value={s.regime}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha de Vigencia</Label>
              <Input type="date" value={newEffectiveFrom} onChange={(e) => setNewEffectiveFrom(e.target.value)} />
              {latestEffectiveFrom && (
                <p className="text-xs text-muted-foreground">
                  Debe ser posterior a {latestEffectiveFrom} (cambio más reciente registrado).
                </p>
              )}
            </div>
            {newEffectiveFrom > todayStr() && (
              <div className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 p-3">
                Este cambio aplicará automáticamente a partir de {newEffectiveFrom} — el campo de régimen actual
                se actualizará manualmente cuando corresponda.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDisposalReasons, useFixedAssets, type FixedAsset } from "@/hooks/useFixedAssets";
import { useDepreciationSchedule } from "@/hooks/useFixedAssets";
import { computeDisposalGainLoss } from "@/domain/fixedAssets/calculations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  asset: FixedAsset;
  onDone: () => void;
}

const fmt = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DisposalWizard({ asset, onDone }: Props) {
  const qc = useQueryClient();
  const { data: reasons = [] } = useDisposalReasons();
  const { data: schedule = [] } = useDepreciationSchedule(asset.id);

  const [reasonId, setReasonId] = useState<number | null>(null);
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().split("T")[0]);
  const [proceeds, setProceeds] = useState(0);
  const [saving, setSaving] = useState(false);

  const selectedReason = reasons.find((r) => r.id === reasonId);
  const isSale = selectedReason?.code === "SALE";

  // Accumulated depreciation from POSTED rows
  const postedAccum = schedule
    .filter((r) => r.status === "POSTED")
    .reduce((sum, r) => sum + (r.posted_depreciation_amount ?? r.planned_depreciation_amount), 0);

  const { netBookValue, gainLoss } = computeDisposalGainLoss(
    asset.acquisition_cost,
    postedAccum,
    isSale ? proceeds : 0
  );

  const canDispose = !!reasonId && !!disposalDate;

  const handleDispose = async () => {
    if (!canDispose) return;
    setSaving(true);
    try {
      // Mark asset disposed/sold
      const newStatus = isSale ? "SOLD" : "DISPOSED";
      const { error: assetErr } = await (supabase as any)
        .from("fixed_assets")
        .update({
          status: newStatus,
          disposed_at: new Date(disposalDate).toISOString(),
          disposal_reason_id: reasonId,
          disposal_proceeds: isSale ? proceeds : 0,
        })
        .eq("id", asset.id);
      if (assetErr) throw assetErr;

      // Mark remaining PLANNED rows as SKIPPED
      const { error: skipErr } = await (supabase as any)
        .from("fixed_asset_depreciation_schedule")
        .update({ status: "SKIPPED" })
        .eq("asset_id", asset.id)
        .eq("status", "PLANNED");
      if (skipErr) throw skipErr;

      // Log event
      await (supabase as any).from("fixed_asset_event_log").insert({
        asset_id: asset.id,
        enterprise_id: asset.enterprise_id,
        event_type: isSale ? "SELL" : "DISPOSE",
        metadata_json: {
          disposal_date: disposalDate,
          reason_id: reasonId,
          proceeds: isSale ? proceeds : 0,
          net_book_value: netBookValue,
          gain_loss: gainLoss,
        },
      });

      qc.invalidateQueries({ queryKey: ["fixed_assets", asset.enterprise_id] });
      qc.invalidateQueries({ queryKey: ["depreciation_schedule", asset.id] });
      toast.success(`Activo ${isSale ? "vendido" : "dado de baja"} correctamente`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al procesar la baja");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Esta acción es irreversible. El activo pasará a estado{" "}
          <strong>{isSale ? "Vendido" : "Baja"}</strong> y no podrá depreciarse más.
        </AlertDescription>
      </Alert>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Depreciación acumulada (contabilizada)</p>
            <p className="font-mono font-semibold">Q {fmt(postedAccum)}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Valor neto en libros</p>
            <p className="font-mono font-semibold">Q {fmt(netBookValue)}</p>
          </CardContent>
        </Card>
        <Card className={gainLoss >= 0 ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Ganancia / Pérdida</p>
            <div className="flex items-center gap-1 font-mono font-semibold">
              {gainLoss >= 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
              Q {fmt(Math.abs(gainLoss))}
              <span className="text-xs text-muted-foreground ml-1">{gainLoss >= 0 ? "ganancia" : "pérdida"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Motivo de baja *</Label>
          <Select value={reasonId ? String(reasonId) : ""} onValueChange={(v) => setReasonId(Number(v))}>
            <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>
              {reasons.map((r) => (<SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Fecha de baja *</Label>
          <Input type="date" value={disposalDate} onChange={(e) => setDisposalDate(e.target.value)} />
        </div>
        {isSale && (
          <div>
            <Label>Monto cobrado por venta (Q)</Label>
            <Input type="number" min={0} step="0.01" value={proceeds}
              onChange={(e) => setProceeds(parseFloat(e.target.value) || 0)} />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          variant="destructive"
          onClick={handleDispose}
          disabled={!canDispose || saving}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isSale ? "Registrar venta" : "Dar de baja"}
        </Button>
      </div>
    </div>
  );
}

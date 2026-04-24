import { useState, useEffect } from "react";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAssetPolicy, useFixedAssets, useDepreciationSchedule, type FixedAsset, type DepreciationScheduleRow } from "@/hooks/useFixedAssets";
import { sumDepreciationForPeriod } from "@/domain/fixedAssets/calculations";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import DepreciationHistoryCard from "./DepreciationHistoryCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as any).from(t);

const fmt = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: "Mensual", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", ANNUAL: "Anual",
};

interface PostingPreviewRow {
  asset: FixedAsset;
  amountPlanned: number;
  amountPosted: number;
  hasPlanned: boolean;
  hasPosted: boolean;
  months: Array<{ year: number; month: number }>;
  scheduleRows: DepreciationScheduleRow[];
}

function AssetScheduleFetcher({
  asset,
  targetYear,
  targetMonth,
  frequency,
  onResult,
}: {
  asset: FixedAsset;
  targetYear: number;
  targetMonth: number;
  frequency: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
  onResult: (row: PostingPreviewRow | null, assetId: number) => void;
}) {
  const { data: schedule = [] } = useDepreciationSchedule(asset.id);

  useEffect(() => {
    if (!schedule.length) {
      onResult(null, asset.id);
      return;
    }
    const result = sumDepreciationForPeriod(
      schedule.map((r) => ({
        year: r.year,
        month: r.month,
        planned_depreciation_amount: r.planned_depreciation_amount,
        accumulated_depreciation: r.accumulated_depreciation,
        net_book_value: r.net_book_value,
        status: r.status,
      })),
      targetYear,
      targetMonth,
      frequency
    );
    const relevantRows = schedule.filter((r) =>
      result.months.some((m) => m.year === r.year && m.month === r.month)
    );
    if (relevantRows.length === 0) {
      onResult(null, asset.id);
      return;
    }
    onResult(
      {
        asset,
        amountPlanned: result.amountPlanned,
        amountPosted: result.amountPosted,
        hasPlanned: result.hasPlanned,
        hasPosted: result.hasPosted,
        months: result.months,
        scheduleRows: relevantRows,
      },
      asset.id
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, targetYear, targetMonth, frequency]);

  return null;
}

export default function DepreciationPostingPage() {
  const { selectedEnterpriseId: enterpriseId } = useEnterprise();
  const qc = useQueryClient();

  const { data: policy } = useAssetPolicy(enterpriseId);
  const { data: assets = [] } = useFixedAssets(enterpriseId);

  const now = new Date();
  const [targetYear, setTargetYear] = useState(now.getFullYear());
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1);
  const [previewRows, setPreviewRows] = useState<Map<number, PostingPreviewRow>>(new Map());
  const [posting, setPosting] = useState(false);

  const activeAssets = assets.filter((a) => a.status === "ACTIVE");
  const frequency = policy?.posting_frequency ?? "MONTHLY";

  // Reset preview when period or enterprise changes
  useEffect(() => {
    setPreviewRows(new Map());
  }, [targetYear, targetMonth, enterpriseId, frequency]);

  const handleResult = (row: PostingPreviewRow | null, assetId: number) => {
    setPreviewRows((prev) => {
      const next = new Map(prev);
      if (row) next.set(assetId, row);
      else next.delete(assetId);
      return next;
    });
  };

  const rows = Array.from(previewRows.values());
  const pendingRows = rows.filter((r) => r.hasPlanned);
  const postedOnlyRows = rows.filter((r) => !r.hasPlanned && r.hasPosted);
  const totalPending = pendingRows.reduce((s, r) => s + r.amountPlanned, 0);
  const totalPosted = postedOnlyRows.reduce((s, r) => s + r.amountPosted, 0);

  const handlePost = async () => {
    if (!enterpriseId || pendingRows.length === 0) return;
    setPosting(true);
    try {
      const runId = `DEP-${targetYear}${String(targetMonth).padStart(2, "0")}-${Date.now()}`;

      for (const row of pendingRows) {
        const scheduleIds = row.scheduleRows
          .filter((r) => r.status === "PLANNED")
          .map((r) => r.id);
        if (scheduleIds.length === 0) continue;

        const { error } = await db("fixed_asset_depreciation_schedule")
          .update({
            status: "POSTED",
            posted_depreciation_amount: row.amountPlanned,
            posting_run_id: runId,
            posted_at: new Date().toISOString(),
          })
          .in("id", scheduleIds);
        if (error) throw error;

        await db("fixed_asset_event_log").insert({
          asset_id: row.asset.id,
          enterprise_id: enterpriseId,
          event_type: "POST_DEPRECIATION",
          metadata_json: {
            run_id: runId,
            amount: row.amountPlanned,
            year: targetYear,
            month: targetMonth,
            frequency,
          },
        });
      }

      // Invalidate ALL depreciation_schedule queries (per-asset cache)
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] === "depreciation_schedule",
      });
      qc.invalidateQueries({ queryKey: ["fixed_assets", enterpriseId] });
      qc.invalidateQueries({ queryKey: ["depreciation_runs", enterpriseId] });

      toast.success(
        `Depreciación contabilizada: Q ${fmt(totalPending)} — ${pendingRows.length} activos`
      );
      setPreviewRows(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al contabilizar");
    } finally {
      setPosting(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  if (!enterpriseId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Selecciona una empresa para contabilizar depreciación.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Config card */}
      <Card>
        <CardHeader>
          <CardTitle>Contabilizar Depreciación</CardTitle>
          <CardDescription>
            Frecuencia configurada: <strong>{FREQ_LABELS[frequency]}</strong>. Selecciona el período de destino.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <Label>Año</Label>
              <Select value={String(targetYear)} onValueChange={(v) => setTargetYear(Number(v))}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Mes</Label>
              <Select value={String(targetMonth)} onValueChange={(v) => setTargetMonth(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.slice(1).map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 text-sm text-muted-foreground">
              {frequency !== "MONTHLY" && (
                <p>Se agregarán los meses correspondientes al período {FREQ_LABELS[frequency].toLowerCase()}.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fetch schedule for each active asset (invisible components) */}
      {activeAssets.map((asset) => (
        <AssetScheduleFetcher
          key={asset.id}
          asset={asset}
          targetYear={targetYear}
          targetMonth={targetMonth}
          frequency={frequency}
          onResult={handleResult}
        />
      ))}

      {/* Summary */}
      {rows.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                Pendientes de contabilizar
              </div>
              <div className="mt-2 text-2xl font-bold">{pendingRows.length}</div>
              <div className="text-sm text-muted-foreground">
                Q {fmt(totalPending)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Ya contabilizados
              </div>
              <div className="mt-2 text-2xl font-bold">{postedOnlyRows.length}</div>
              <div className="text-sm text-muted-foreground">
                Q {fmt(totalPosted)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalle por activo</CardTitle>
            <CardDescription>
              Estado de la depreciación de cada activo para el período seleccionado.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activo</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const isPosted = !row.hasPlanned && row.hasPosted;
                  const amount = isPosted ? row.amountPosted : row.amountPlanned;
                  return (
                    <TableRow key={row.asset.id}>
                      <TableCell>{row.asset.asset_name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{row.asset.asset_code}</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(amount)}</TableCell>
                      <TableCell>
                        {isPosted ? (
                          <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                            <CheckCircle className="h-3 w-3 text-green-600" /> Ya contabilizado
                          </Badge>
                        ) : row.hasPosted ? (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit text-amber-700 border-amber-300">
                            <Clock className="h-3 w-3" /> Parcial
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="flex items-center gap-1 w-fit text-amber-700 border-amber-300">
                            <Clock className="h-3 w-3" /> Pendiente
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeAssets.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No hay activos activos. Activa activos primero para poder contabilizar depreciación.</AlertDescription>
        </Alert>
      )}

      {/* Action button */}
      {rows.length > 0 && (
        <div className="flex justify-end items-center gap-3">
          {pendingRows.length === 0 && (
            <Alert className="flex-1">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                Este período ya fue contabilizado completamente. No hay nada pendiente.
              </AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handlePost}
            disabled={posting || pendingRows.length === 0}
            size="lg"
          >
            {posting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {pendingRows.length === 0
              ? "Período contabilizado"
              : `Contabilizar Q ${fmt(totalPending)}`}
          </Button>
        </div>
      )}

      {/* History */}
      <DepreciationHistoryCard enterpriseId={enterpriseId} />
    </div>
  );
}

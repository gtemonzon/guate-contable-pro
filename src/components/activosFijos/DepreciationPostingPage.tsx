import { useState, useEffect } from "react";
import { useEnterprise } from "@/contexts/EnterpriseContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useAssetCategories,
  useAssetPolicy,
  useFixedAssets,
  useDepreciationSchedule,
  useHistoricalPendingDepreciation,
  type FixedAsset,
  type DepreciationScheduleRow,
} from "@/hooks/useFixedAssets";
import { sumDepreciationForPeriod } from "@/domain/fixedAssets/calculations";
import { allocateEntryNumber } from "@/utils/journalEntryNumbering";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, AlertCircle, Clock, History } from "lucide-react";
import DepreciationHistoryCard from "./DepreciationHistoryCard";

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

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function periodKey(year: number, month: number) {
  return year * 12 + month - 1;
}

function formatDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
      frequency,
    );
    const relevantRows = schedule.filter((r) => result.months.some((m) => m.year === r.year && m.month === r.month));
    if (relevantRows.length === 0) {
      onResult(null, asset.id);
      return;
    }
    onResult({ asset, amountPlanned: result.amountPlanned, amountPosted: result.amountPosted, hasPlanned: result.hasPlanned, hasPosted: result.hasPosted, months: result.months, scheduleRows: relevantRows }, asset.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, targetYear, targetMonth, frequency]);

  return null;
}

export default function DepreciationPostingPage() {
  const { selectedEnterpriseId: enterpriseId } = useEnterprise();
  const qc = useQueryClient();
  const { data: policy } = useAssetPolicy(enterpriseId);
  const { data: assets = [] } = useFixedAssets(enterpriseId);
  const { data: categories = [] } = useAssetCategories(enterpriseId);
  const { data: historicalPending = [] } = useHistoricalPendingDepreciation(enterpriseId);

  const now = new Date();
  const [targetYear, setTargetYear] = useState(now.getFullYear());
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1);
  const [previewRows, setPreviewRows] = useState<Map<number, PostingPreviewRow>>(new Map());
  const [posting, setPosting] = useState(false);
  const [bulkSkipDialogOpen, setBulkSkipDialogOpen] = useState(false);
  const [bulkSkipCutoff, setBulkSkipCutoff] = useState(() =>
    formatDateInput(new Date(now.getFullYear(), now.getMonth(), 0)),
  );
  const [bulkSkipping, setBulkSkipping] = useState(false);

  const activeAssets = assets.filter((a) => a.status === "ACTIVE");
  const frequency = policy?.posting_frequency ?? "MONTHLY";

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
    let generatedCount = 0;
    let generatedTotal = 0;
    const processingErrors: string[] = [];

    try {
      const runId = `DEP-${targetYear}${String(targetMonth).padStart(2, "0")}-${Date.now()}`;
      const entryDate = `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(lastDayOfMonth(targetYear, targetMonth)).padStart(2, "0")}`;
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Usuario no autenticado");
      const { data: period, error: periodError } = await supabase
        .from("tab_accounting_periods")
        .select("id")
        .eq("enterprise_id", enterpriseId)
        .eq("status", "abierto")
        .lte("start_date", entryDate)
        .gte("end_date", entryDate)
        .maybeSingle();
      if (periodError) throw periodError;
      if (!period) throw new Error(`No existe un período contable abierto para ${MONTHS[targetMonth]} ${targetYear}`);

      for (const row of pendingRows) {
        const category = categories.find((item) => item.id === row.asset.category_id);
        if (!category?.depreciation_expense_account_id || !category.accumulated_depreciation_account_id) {
          const message = `La categoría ${category?.name ?? "sin categoría"} no tiene cuentas de depreciación configuradas`;
          processingErrors.push(`${row.asset.asset_name}: ${message}`);
          toast.error(message);
          continue;
        }

        const scheduleIds = row.scheduleRows.filter((scheduleRow) => scheduleRow.status === "PLANNED").map((scheduleRow) => scheduleRow.id);
        if (scheduleIds.length === 0) continue;

        try {
          const entryNumber = await allocateEntryNumber(String(enterpriseId), "depreciacion", entryDate);
          const description = `Depreciación ${MONTHS[targetMonth]} ${targetYear} — ${row.asset.asset_name} (${row.asset.asset_code})`;
          const { data: entry, error: entryError } = await supabase.from("tab_journal_entries").insert({
            enterprise_id: enterpriseId,
            accounting_period_id: period.id,
            entry_number: entryNumber,
            entry_date: entryDate,
            description,
            entry_type: "depreciacion",
            total_debit: row.amountPlanned,
            total_credit: row.amountPlanned,
            is_balanced: true,
            is_posted: true,
            posted_at: new Date().toISOString(),
            status: "contabilizado",
            currency_code: row.asset.currency || "GTQ",
            exchange_rate: 1,
            created_by: authData.user.id,
          }).select("id").single();
          if (entryError || !entry?.id) throw entryError ?? new Error("No se pudo crear la partida de depreciación");

          const { error: detailsError } = await supabase.from("tab_journal_entry_details").insert([
            {
              journal_entry_id: entry.id,
              line_number: 1,
              account_id: category.depreciation_expense_account_id,
              description,
              debit_amount: row.amountPlanned,
              credit_amount: 0,
            },
            {
              journal_entry_id: entry.id,
              line_number: 2,
              account_id: category.accumulated_depreciation_account_id,
              description,
              debit_amount: 0,
              credit_amount: row.amountPlanned,
            },
          ]);
          if (detailsError) throw detailsError;

          const { data: updatedSchedule, error: scheduleError } = await supabase
            .from("fixed_asset_depreciation_schedule")
            .update({ status: "POSTED", journal_entry_id: entry.id, posted_depreciation_amount: row.amountPlanned, posting_run_id: runId, posted_at: new Date().toISOString() })
            .eq("asset_id", row.asset.id)
            .eq("enterprise_id", enterpriseId)
            .eq("status", "PLANNED")
            .in("id", scheduleIds)
            .select("id");
          if (scheduleError) throw scheduleError;
          if (!updatedSchedule || updatedSchedule.length !== scheduleIds.length) {
            throw new Error(`El calendario de ${row.asset.asset_name} cambió mientras se contabilizaba; la partida no se vinculó al calendario completo`);
          }

          const { error: eventError } = await supabase.from("fixed_asset_event_log").insert({
            asset_id: row.asset.id,
            enterprise_id: enterpriseId,
            actor_user_id: authData.user.id,
            event_type: "POST_DEPRECIATION",
            metadata_json: { run_id: runId, amount: row.amountPlanned, year: targetYear, month: targetMonth, frequency, journal_entry_id: entry.id, entry_number: entryNumber },
          });
          if (eventError) throw eventError;

          generatedCount += 1;
          generatedTotal += row.amountPlanned;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error al crear la partida";
          processingErrors.push(`${row.asset.asset_name}: ${message}`);
          toast.error(`No se pudo contabilizar ${row.asset.asset_name}: ${message}`);
        }
      }

      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "depreciation_schedule" });
      qc.invalidateQueries({ queryKey: ["fixed_assets", enterpriseId] });
      qc.invalidateQueries({ queryKey: ["depreciation_runs", enterpriseId] });

      if (generatedCount > 0) {
        toast.success(`Depreciación contabilizada: Q ${fmt(generatedTotal)} — ${generatedCount} partidas generadas`);
      } else if (processingErrors.length === 0) {
        toast.error("No se generaron partidas de depreciación");
      }
      setPreviewRows(new Map());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al contabilizar");
    } finally {
      setPosting(false);
    }
  };

  const handleBulkSkipHistorical = async () => {
    if (!enterpriseId || historicalPending.length === 0) return;

    const [cutoffYear, cutoffMonth] = bulkSkipCutoff.split("-").map(Number);
    if (!cutoffYear || !cutoffMonth) {
      toast.error("Selecciona una fecha de corte válida.");
      return;
    }
    const currentPeriodKey = periodKey(now.getFullYear(), now.getMonth() + 1);
    if (periodKey(cutoffYear, cutoffMonth) >= currentPeriodKey) {
      toast.error("La fecha de corte debe corresponder a un mes anterior al actual.");
      return;
    }

    setBulkSkipping(true);
    let assetsSkipped = 0;
    let monthsSkippedTotal = 0;
    const errors: string[] = [];

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Usuario no autenticado");

      const assetIds = historicalPending.map((item) => item.asset_id);
      const { data: plannedRows, error: scheduleError } = await supabase
        .from("fixed_asset_depreciation_schedule")
        .select("id, asset_id, year, month")
        .eq("enterprise_id", enterpriseId)
        .eq("status", "PLANNED")
        .in("asset_id", assetIds);
      if (scheduleError) throw scheduleError;

      const rowsByAsset = new Map<number, Array<{ id: number; year: number; month: number }>>();
      for (const row of plannedRows ?? []) {
        if (periodKey(row.year, row.month) > periodKey(cutoffYear, cutoffMonth)) continue;
        const list = rowsByAsset.get(row.asset_id) ?? [];
        list.push(row);
        rowsByAsset.set(row.asset_id, list);
      }

      for (const item of historicalPending) {
        const rowsToSkip = rowsByAsset.get(item.asset_id) ?? [];
        if (rowsToSkip.length === 0) continue;
        const rowIds = rowsToSkip.map((row) => row.id);

        try {
          const { data: updatedRows, error: updateError } = await supabase
            .from("fixed_asset_depreciation_schedule")
            .update({ status: "SKIPPED", journal_entry_id: null, posted_depreciation_amount: null })
            .eq("asset_id", item.asset_id)
            .eq("enterprise_id", enterpriseId)
            .eq("status", "PLANNED")
            .in("id", rowIds)
            .select("id");
          if (updateError) throw updateError;
          if (!updatedRows || updatedRows.length !== rowIds.length) {
            throw new Error("El calendario cambió mientras se procesaba; no se omitieron todos los meses de este activo");
          }

          const { error: eventError } = await supabase.from("fixed_asset_event_log").insert({
            asset_id: item.asset_id,
            enterprise_id: enterpriseId,
            actor_user_id: authData.user.id,
            event_type: "SKIP_HISTORICAL_DEPRECIATION",
            metadata_json: { months_skipped: rowIds.length, cutoff_date: bulkSkipCutoff },
          });
          if (eventError) throw eventError;

          assetsSkipped += 1;
          monthsSkippedTotal += rowIds.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error al procesar el activo";
          errors.push(`${item.asset_name}: ${message}`);
        }
      }

      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "depreciation_schedule" });
      qc.invalidateQueries({ queryKey: ["historical_pending_depreciation", enterpriseId] });

      if (assetsSkipped > 0) {
        toast.success(
          `Depreciación histórica actualizada — ${assetsSkipped} activo(s), ${monthsSkippedTotal} mes(es) en total marcados sin partida.`,
        );
      }
      errors.forEach((message) => toast.error(message));
      if (assetsSkipped === 0 && errors.length === 0) {
        toast.error("No había meses históricos pendientes hasta la fecha de corte seleccionada.");
      }
      setBulkSkipDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al procesar la depreciación histórica");
    } finally {
      setBulkSkipping(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  if (!enterpriseId) {
    return <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">Selecciona una empresa para contabilizar depreciación.</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contabilizar Depreciación</CardTitle>
          <CardDescription>Frecuencia configurada: <strong>{FREQ_LABELS[frequency]}</strong>. Selecciona el período de destino.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div><Label>Año</Label><Select value={String(targetYear)} onValueChange={(v) => setTargetYear(Number(v))}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Mes</Label><Select value={String(targetMonth)} onValueChange={(v) => setTargetMonth(Number(v))}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{MONTHS.slice(1).map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex-1 text-sm text-muted-foreground">{frequency !== "MONTHLY" && <p>Se agregarán los meses correspondientes al período {FREQ_LABELS[frequency].toLowerCase()}.</p>}</div>
          </div>
        </CardContent>
      </Card>

      {historicalPending.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-400">
              <History className="h-5 w-5" />
              Depreciación histórica pendiente
            </CardTitle>
            <CardDescription>
              {historicalPending.length} activo(s) tienen depreciación de meses ya transcurridos sin contabilizar
              (ej. activos registrados con fecha de adquisición antigua). Puedes marcarla como aplicada sin generar
              partidas contables — útil cuando esa depreciación ya se refleja en tus libros por otro medio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1 text-sm">
              {historicalPending.map((item) => (
                <li key={item.asset_id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{item.asset_name}</span>
                  <span className="font-mono text-muted-foreground">{item.asset_code}</span>
                  <span className="text-muted-foreground">
                    — {item.months_count} mes(es) desde {MONTHS[item.earliest.month]} {item.earliest.year}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setBulkSkipDialogOpen(true)}>
                Correr depreciación histórica (sin partida)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {activeAssets.map((asset) => <AssetScheduleFetcher key={asset.id} asset={asset} targetYear={targetYear} targetMonth={targetMonth} frequency={frequency} onResult={handleResult} />)}

      {rows.length > 0 && <div className="grid gap-4 sm:grid-cols-2"><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Pendientes de contabilizar</div><div className="mt-2 text-2xl font-bold">{pendingRows.length}</div><div className="text-sm text-muted-foreground">Q {fmt(totalPending)}</div></CardContent></Card><Card><CardContent className="p-4"><div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle className="h-4 w-4 text-green-600" />Ya contabilizados</div><div className="mt-2 text-2xl font-bold">{postedOnlyRows.length}</div><div className="text-sm text-muted-foreground">Q {fmt(totalPosted)}</div></CardContent></Card></div>}

      {rows.length > 0 && <Card><CardHeader><CardTitle>Detalle por activo</CardTitle><CardDescription>Estado de la depreciación de cada activo para el período seleccionado.</CardDescription></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Activo</TableHead><TableHead>Código</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const isPosted = !row.hasPlanned && row.hasPosted; const amount = isPosted ? row.amountPosted : row.amountPlanned; return <TableRow key={row.asset.id}><TableCell>{row.asset.asset_name}</TableCell><TableCell className="font-mono text-muted-foreground">{row.asset.asset_code}</TableCell><TableCell className="text-right font-mono">Q {fmt(amount)}</TableCell><TableCell>{isPosted ? <Badge variant="secondary" className="flex w-fit items-center gap-1"><CheckCircle className="h-3 w-3 text-green-600" /> Ya contabilizado</Badge> : row.hasPosted ? <Badge variant="outline" className="flex w-fit items-center gap-1 text-amber-700 border-amber-300"><Clock className="h-3 w-3" /> Parcial</Badge> : <Badge variant="outline" className="flex w-fit items-center gap-1 text-amber-700 border-amber-300"><Clock className="h-3 w-3" /> Pendiente</Badge>}</TableCell></TableRow>; })}</TableBody></Table></CardContent></Card>}

      {activeAssets.length === 0 && <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>No hay activos activos. Activa activos primero para poder contabilizar depreciación.</AlertDescription></Alert>}

      {rows.length > 0 && <div className="flex items-center justify-end gap-3">{pendingRows.length === 0 && <Alert className="flex-1"><CheckCircle className="h-4 w-4 text-green-600" /><AlertDescription>Este período ya fue contabilizado completamente. No hay nada pendiente.</AlertDescription></Alert>}<Button onClick={handlePost} disabled={posting || pendingRows.length === 0} size="lg">{posting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{pendingRows.length === 0 ? "Período contabilizado" : `Contabilizar Q ${fmt(totalPending)}`}</Button></div>}

      <DepreciationHistoryCard enterpriseId={enterpriseId} />

      <AlertDialog open={bulkSkipDialogOpen} onOpenChange={setBulkSkipDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Marcar depreciación histórica como aplicada?</AlertDialogTitle>
            <AlertDialogDescription>
              Esto marcará como aplicadas las depreciaciones de meses ya transcurridos de todos los activos afectados
              SIN generar ninguna partida contable — útil para activos históricos cuya depreciación de años
              anteriores ya fue registrada por otro medio. El calendario y el valor en libros de cada activo se
              actualizarán, pero no se creará ningún asiento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="bulk-historical-cutoff">Fecha de corte</Label>
            <Input
              id="bulk-historical-cutoff"
              type="date"
              value={bulkSkipCutoff}
              onChange={(e) => setBulkSkipCutoff(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSkipping}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkSkipping}
              onClick={(e) => {
                e.preventDefault();
                void handleBulkSkipHistorical();
              }}
            >
              {bulkSkipping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

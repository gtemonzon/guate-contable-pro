import { useState, useEffect } from "react";
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
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as any).from(t);

const fmt = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: "Mensual", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", ANNUAL: "Anual",
};

// A row that summarises what would be posted for a single asset
interface PostingPreviewRow {
  asset: FixedAsset;
  amount: number;
  months: Array<{ year: number; month: number }>;
  scheduleRows: DepreciationScheduleRow[];
  alreadyPosted: boolean;
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
  onResult: (row: PostingPreviewRow) => void;
}) {
  const { data: schedule = [] } = useDepreciationSchedule(asset.id);

  useEffect(() => {
    if (!schedule.length) return;
    const { amount, months } = sumDepreciationForPeriod(
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
      months.some((m) => m.year === r.year && m.month === r.month)
    );
    const alreadyPosted = relevantRows.some((r) => r.status === "POSTED");
    onResult({ asset, amount, months, scheduleRows: relevantRows, alreadyPosted });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule, targetYear, targetMonth, frequency]);

  return null;
}

export default function DepreciationPostingPage() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const id = localStorage.getItem("currentEnterpriseId");
    if (id) setEnterpriseId(Number(id));
  }, []);

  const { data: policy } = useAssetPolicy(enterpriseId);
  const { data: assets = [] } = useFixedAssets(enterpriseId);

  const now = new Date();
  const [targetYear, setTargetYear] = useState(now.getFullYear());
  const [targetMonth, setTargetMonth] = useState(now.getMonth() + 1);
  const [previewRows, setPreviewRows] = useState<Map<number, PostingPreviewRow>>(new Map());
  const [posting, setPosting] = useState(false);

  const activeAssets = assets.filter((a) => a.status === "ACTIVE");
  const frequency = policy?.posting_frequency ?? "MONTHLY";

  const handleResult = (row: PostingPreviewRow) => {
    setPreviewRows((prev) => {
      const next = new Map(prev);
      if (row.amount > 0) next.set(row.asset.id, row);
      return next;
    });
  };

  const rows = Array.from(previewRows.values());
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const toPostRows = rows.filter((r) => !r.alreadyPosted && r.amount > 0);

  const handlePost = async () => {
    if (!enterpriseId || toPostRows.length === 0) return;
    setPosting(true);
    try {
      const runId = `DEP-${targetYear}${String(targetMonth).padStart(2, "0")}-${Date.now()}`;

      for (const row of toPostRows) {
        const scheduleIds = row.scheduleRows.filter((r) => r.status === "PLANNED").map((r) => r.id);
        if (scheduleIds.length === 0) continue;

        // Mark schedule rows as POSTED
        const { error } = await db("fixed_asset_depreciation_schedule")
          .update({
            status: "POSTED",
            posted_depreciation_amount: row.amount,
            posting_run_id: runId,
            posted_at: new Date().toISOString(),
          })
          .in("id", scheduleIds);
        if (error) throw error;

        // Log event
        await db("fixed_asset_event_log").insert({
          asset_id: row.asset.id,
          enterprise_id: enterpriseId,
          event_type: "POST_DEPRECIATION",
          metadata_json: { run_id: runId, amount: row.amount, year: targetYear, month: targetMonth, frequency },
        });
      }

      qc.invalidateQueries({ queryKey: ["fixed_assets", enterpriseId] });
      qc.invalidateQueries({ queryKey: ["depreciation_schedule"] });
      toast.success(`Depreciación contabilizada: Q ${fmt(toPostRows.reduce((s, r) => s + r.amount, 0))} — ${toPostRows.length} activos`);
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

      {/* Preview table */}
      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa de contabilización</CardTitle>
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
                {rows.map((row) => (
                  <TableRow key={row.asset.id}>
                    <TableCell>{row.asset.asset_name}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{row.asset.asset_code}</TableCell>
                    <TableCell className="text-right font-mono">Q {fmt(row.amount)}</TableCell>
                    <TableCell>
                      {row.alreadyPosted ? (
                        <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                          <CheckCircle className="h-3 w-3 text-green-600" /> Ya contabilizado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300">Pendiente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/30">
                  <TableCell colSpan={2}>Total a contabilizar</TableCell>
                  <TableCell className="text-right font-mono">
                    Q {fmt(toPostRows.reduce((s, r) => s + r.amount, 0))}
                  </TableCell>
                  <TableCell>{toPostRows.length} activos</TableCell>
                </TableRow>
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

      {toPostRows.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handlePost} disabled={posting} size="lg">
            {posting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Contabilizar Q {fmt(toPostRows.reduce((s, r) => s + r.amount, 0))}
          </Button>
        </div>
      )}
    </div>
  );
}

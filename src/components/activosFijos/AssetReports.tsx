import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFixedAssets } from "@/hooks/useFixedAssets";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Download, FileText } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (t: string) => (supabase as any).from(t);

const fmt = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface AssetSummary {
  asset_id: number;
  asset_code: string;
  asset_name: string;
  category_name: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  acquisition_date: string;
  status: string;
  accumulated_depreciation: number;
  net_book_value: number;
}

export default function AssetReports() {
  const [enterpriseId, setEnterpriseId] = useState<number | null>(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const id = localStorage.getItem("currentEnterpriseId");
    if (id) setEnterpriseId(Number(id));
  }, []);

  const { data: assets = [], isLoading: assetsLoading } = useFixedAssets(enterpriseId);

  // Depreciation summary per asset using schedule data
  const { data: summaries = [], isLoading: summaryLoading } = useQuery<AssetSummary[]>({
    queryKey: ["asset_depreciation_summary", enterpriseId, asOfDate],
    enabled: !!enterpriseId,
    queryFn: async () => {
      // Fetch all active/disposed assets with schedule aggregation
      const { data: scheduleData, error } = await db("fixed_asset_depreciation_schedule")
        .select(`
          asset_id,
          planned_depreciation_amount,
          year,
          month,
          fixed_assets!inner(
            asset_code, asset_name, acquisition_cost, residual_value,
            useful_life_months, acquisition_date, status, enterprise_id,
            category:fixed_asset_categories(name)
          )
        `)
        .eq("fixed_assets.enterprise_id", enterpriseId!);
      if (error) throw error;

      const byAsset = new Map<number, AssetSummary>();
      const cutoff = new Date(asOfDate);

      for (const row of (scheduleData ?? [])) {
        const rowDate = new Date(row.year, row.month - 1, 1);
        if (rowDate > cutoff) continue;

        const fa = row.fixed_assets as any;
        const existing = byAsset.get(row.asset_id);
        if (!existing) {
          byAsset.set(row.asset_id, {
            asset_id: row.asset_id,
            asset_code: fa.asset_code,
            asset_name: fa.asset_name,
            category_name: fa.category?.name ?? "—",
            acquisition_cost: fa.acquisition_cost,
            residual_value: fa.residual_value,
            useful_life_months: fa.useful_life_months,
            acquisition_date: fa.acquisition_date,
            status: fa.status,
            accumulated_depreciation: row.planned_depreciation_amount,
            net_book_value: fa.acquisition_cost - row.planned_depreciation_amount,
          });
        } else {
          existing.accumulated_depreciation += row.planned_depreciation_amount;
          existing.net_book_value = existing.acquisition_cost - existing.accumulated_depreciation;
        }
      }

      return Array.from(byAsset.values()).sort((a, b) => a.asset_code.localeCompare(b.asset_code));
    },
  });

  const totalCost = summaries.reduce((s, r) => s + r.acquisition_cost, 0);
  const totalAccum = summaries.reduce((s, r) => s + r.accumulated_depreciation, 0);
  const totalNBV = summaries.reduce((s, r) => s + r.net_book_value, 0);

  const exportCSV = () => {
    const header = ["Código", "Nombre", "Categoría", "Costo", "Depr. Acumulada", "VNC", "Estado"];
    const rows = summaries.map((r) => [
      r.asset_code, r.asset_name, r.category_name,
      r.acquisition_cost, r.accumulated_depreciation, r.net_book_value, r.status,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activos_fijos_${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!enterpriseId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
        Selecciona una empresa para ver reportes.
      </div>
    );
  }

  const isLoading = assetsLoading || summaryLoading;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Registro de Activos Fijos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Depreciación acumulada al</Label>
              <Input type="date" className="w-48" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
            <Button variant="outline" onClick={exportCSV} disabled={summaries.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Costo total", value: `Q ${fmt(totalCost)}` },
          { label: "Depreciación acumulada", value: `Q ${fmt(totalAccum)}` },
          { label: "Valor neto en libros", value: `Q ${fmt(totalNBV)}` },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="text-xl font-bold font-mono">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando reporte...
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Depr. Acumulada</TableHead>
                  <TableHead className="text-right">Valor Neto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      Sin activos con calendario de depreciación.
                    </TableCell>
                  </TableRow>
                )}
                {summaries.map((row) => (
                  <TableRow key={row.asset_id}>
                    <TableCell className="font-mono font-medium">{row.asset_code}</TableCell>
                    <TableCell>{row.asset_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{row.category_name}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(row.acquisition_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">
                      {fmt(row.accumulated_depreciation)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {fmt(row.net_book_value)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "ACTIVE" ? "default" : "secondary"}>
                        {{ DRAFT: "Borrador", ACTIVE: "Activo", DISPOSED: "Baja", SOLD: "Vendido" }[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {summaries.length > 0 && (
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell colSpan={3}>Totales</TableCell>
                    <TableCell className="text-right font-mono">Q {fmt(totalCost)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">Q {fmt(totalAccum)}</TableCell>
                    <TableCell className="text-right font-mono">Q {fmt(totalNBV)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Stats by category */}
      {assets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(
                assets.reduce((acc: Record<string, { count: number; total: number }>, a) => {
                  const key = a.category?.name ?? "Sin categoría";
                  if (!acc[key]) acc[key] = { count: 0, total: 0 };
                  acc[key].count++;
                  acc[key].total += a.acquisition_cost;
                  return acc;
                }, {})
              ).map(([cat, { count, total }]) => (
                <div key={cat} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm font-medium">{cat}</span>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{count} activo{count !== 1 ? "s" : ""}</span>
                    <span className="font-mono font-medium">Q {fmt(total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

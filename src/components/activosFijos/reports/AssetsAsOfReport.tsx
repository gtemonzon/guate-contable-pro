import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileDown } from "lucide-react";
import { previewPdfDoc } from "@/lib/pdfPreview";
import {
  useFixedAssets,
  useAllDepreciationSchedule,
  type FixedAsset,
} from "@/hooks/useFixedAssets";
import { fmt, formatDateEs, parseDateParts, sumDepreciationUpTo, isPresentAsOf } from "./reportShared";
import { drawAssetReportHeader } from "./reportPdfHelpers";

interface Props {
  enterpriseId: number;
  enterpriseName: string;
  enterpriseNit: string;
}

interface AssetAsOfRow {
  asset: FixedAsset;
  accumulatedDepreciation: number;
  netBookValue: number;
}

export default function AssetsAsOfReport({ enterpriseId, enterpriseName, enterpriseNit }: Props) {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: assets = [], isLoading: assetsLoading } = useFixedAssets(enterpriseId);
  const eligibleAssets = useMemo(() => assets.filter((a) => a.status !== "DRAFT"), [assets]);
  const { data: scheduleRows = [], isLoading: scheduleLoading } = useAllDepreciationSchedule(enterpriseId);
  const isLoading = assetsLoading || scheduleLoading;

  const rows = useMemo<AssetAsOfRow[]>(() => {
    if (!asOfDate) return [];
    const { year: cutoffYear, month: cutoffMonth } = parseDateParts(asOfDate);
    const scheduleByAsset = new Map<number, typeof scheduleRows>();
    for (const row of scheduleRows) {
      const list = scheduleByAsset.get(row.asset_id) ?? [];
      list.push(row);
      scheduleByAsset.set(row.asset_id, list);
    }

    return eligibleAssets
      .filter((asset) => isPresentAsOf(asset, asOfDate))
      .map((asset) => {
        const accumulatedDepreciation = sumDepreciationUpTo(
          scheduleByAsset.get(asset.id) ?? [],
          cutoffYear,
          cutoffMonth,
        );
        return {
          asset,
          accumulatedDepreciation,
          netBookValue: asset.acquisition_cost - accumulatedDepreciation,
        };
      })
      .sort((a, b) => a.asset.asset_code.localeCompare(b.asset.asset_code));
  }, [eligibleAssets, scheduleRows, asOfDate]);

  const totalCost = rows.reduce((sum, r) => sum + r.asset.acquisition_cost, 0);
  const totalDepreciation = rows.reduce((sum, r) => sum + r.accumulatedDepreciation, 0);
  const totalNetBookValue = rows.reduce((sum, r) => sum + r.netBookValue, 0);

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "portrait" });
    const startY = drawAssetReportHeader(doc, {
      enterpriseName,
      enterpriseNit,
      title: `Activos Fijos a la Fecha — Al ${formatDateEs(asOfDate)}`,
    });

    autoTable(doc, {
      startY,
      head: [["Código", "Descripción", "Costo de compra", "Depreciación a la fecha", "Valor en Libros"]],
      body: rows.map((r) => [
        r.asset.asset_code,
        r.asset.asset_name,
        `Q ${fmt(r.asset.acquisition_cost)}`,
        `Q ${fmt(r.accumulatedDepreciation)}`,
        `Q ${fmt(r.netBookValue)}`,
      ]),
      foot: [[
        { content: "Totales", colSpan: 2, styles: { fontStyle: "bold", halign: "right" } },
        { content: `Q ${fmt(totalCost)}`, styles: { fontStyle: "bold" } },
        { content: `Q ${fmt(totalDepreciation)}`, styles: { fontStyle: "bold" } },
        { content: `Q ${fmt(totalNetBookValue)}`, styles: { fontStyle: "bold" } },
      ]],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      footStyles: { fillColor: [230, 230, 230], textColor: 0 },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });

    previewPdfDoc(doc, `Activos_Fijos_a_la_Fecha_${asOfDate}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Activos Fijos a la Fecha</CardTitle>
          <CardDescription>
            Costo, depreciación acumulada y valor en libros de los activos vigentes a una fecha de corte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Fecha de corte</Label>
              <Input type="date" className="w-48" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
            <Button variant="outline" onClick={exportPdf} disabled={rows.length === 0}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Costo total", value: `Q ${fmt(totalCost)}` },
          { label: "Depreciación a la fecha", value: `Q ${fmt(totalDepreciation)}` },
          { label: "Valor en libros total", value: `Q ${fmt(totalNetBookValue)}` },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-muted/30">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <p className="text-xl font-bold font-mono">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Costo de compra</TableHead>
                  <TableHead className="text-right">Depreciación a la fecha</TableHead>
                  <TableHead className="text-right">Valor en Libros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      Sin activos vigentes a esta fecha.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.asset.id}>
                    <TableCell className="font-mono font-medium">{r.asset.asset_code}</TableCell>
                    <TableCell>{r.asset.asset_name}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.asset.acquisition_cost)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">
                      {fmt(r.accumulatedDepreciation)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmt(r.netBookValue)}</TableCell>
                  </TableRow>
                ))}
                {rows.length > 0 && (
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell colSpan={2}>Totales</TableCell>
                    <TableCell className="text-right font-mono">Q {fmt(totalCost)}</TableCell>
                    <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">
                      Q {fmt(totalDepreciation)}
                    </TableCell>
                    <TableCell className="text-right font-mono">Q {fmt(totalNetBookValue)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

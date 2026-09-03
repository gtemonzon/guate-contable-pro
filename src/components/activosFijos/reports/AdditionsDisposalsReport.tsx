import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable, { type RowInput } from "jspdf-autotable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileDown } from "lucide-react";
import { previewPdfDoc } from "@/lib/pdfPreview";
import {
  useFixedAssets,
  useAssetCategories,
  useDisposalReasons,
  type FixedAsset,
  type FixedAssetCategory,
} from "@/hooks/useFixedAssets";
import { fmt, formatDateEs, isPresentAtStart, disposalDateOnly } from "./reportShared";
import { drawAssetReportHeader, getAutoTableFinalY } from "./reportPdfHelpers";

interface Props {
  enterpriseId: number;
  enterpriseName: string;
  enterpriseNit: string;
}

interface MovementDetail {
  asset: FixedAsset;
  date: string;
  amount: number;
  reason?: string;
}

interface CategorySection {
  category: FixedAssetCategory;
  openingBalance: number;
  additions: MovementDetail[];
  disposals: MovementDetail[];
  closingBalance: number;
}

function buildSections(
  assets: FixedAsset[],
  categories: FixedAssetCategory[],
  startDate: string,
  endDate: string,
  disposalReasonName: (id: number | null) => string | undefined,
): CategorySection[] {
  return categories
    .map((category) => {
      const categoryAssets = assets.filter((a) => a.category_id === category.id);

      const openingBalance = categoryAssets
        .filter((a) => isPresentAtStart(a, startDate))
        .reduce((sum, a) => sum + a.acquisition_cost, 0);

      const additions: MovementDetail[] = categoryAssets
        .filter((a) => a.acquisition_date >= startDate && a.acquisition_date <= endDate)
        .map((a) => ({ asset: a, date: a.acquisition_date, amount: a.acquisition_cost }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const disposals: MovementDetail[] = categoryAssets
        .filter((a) => {
          if (!a.disposed_at) return false;
          const d = disposalDateOnly(a.disposed_at);
          return d >= startDate && d <= endDate;
        })
        .map((a) => ({
          asset: a,
          date: disposalDateOnly(a.disposed_at as string),
          amount: -a.acquisition_cost,
          reason: disposalReasonName(a.disposal_reason_id),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const sumAdditions = additions.reduce((sum, m) => sum + m.amount, 0);
      const sumDisposals = disposals.reduce((sum, m) => sum + Math.abs(m.amount), 0);
      const closingBalance = openingBalance + sumAdditions - sumDisposals;

      return { category, openingBalance, additions, disposals, closingBalance };
    })
    .filter((section) => section.openingBalance > 0 || section.additions.length > 0 || section.disposals.length > 0);
}

export default function AdditionsDisposalsReport({ enterpriseId, enterpriseName, enterpriseNit }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(`${today.slice(0, 4)}-01-01`);
  const [endDate, setEndDate] = useState(today);

  const { data: assets = [], isLoading: assetsLoading } = useFixedAssets(enterpriseId);
  const { data: categories = [], isLoading: categoriesLoading } = useAssetCategories(enterpriseId);
  const { data: disposalReasons = [] } = useDisposalReasons();
  const isLoading = assetsLoading || categoriesLoading;

  const disposalReasonName = (id: number | null): string | undefined =>
    id ? disposalReasons.find((r) => r.id === id)?.name : undefined;

  const sections = useMemo(
    () => buildSections(assets, categories, startDate, endDate, disposalReasonName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, categories, startDate, endDate, disposalReasons],
  );

  const totals = sections.reduce(
    (acc, s) => ({
      opening: acc.opening + s.openingBalance,
      additions: acc.additions + s.additions.reduce((sum, m) => sum + m.amount, 0),
      disposals: acc.disposals + s.disposals.reduce((sum, m) => sum + Math.abs(m.amount), 0),
      closing: acc.closing + s.closingBalance,
    }),
    { opening: 0, additions: 0, disposals: 0, closing: 0 },
  );

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "portrait" });
    const startY = drawAssetReportHeader(doc, {
      enterpriseName,
      enterpriseNit,
      title: `Altas y Bajas de Activos Fijos — Del ${formatDateEs(startDate)} al ${formatDateEs(endDate)}`,
    });

    const body: RowInput[] = [];
    sections.forEach((s) => {
      body.push([
        { content: s.category.name, colSpan: 4, styles: { fontStyle: "bold", fillColor: [230, 230, 230] } },
      ]);
      body.push([
        { content: "Saldo Inicial de Categoría", colSpan: 3, styles: { fontStyle: "bold" } },
        { content: `Q ${fmt(s.openingBalance)}`, styles: { fontStyle: "bold", halign: "right" } },
      ]);
      if (s.additions.length > 0) {
        body.push([{ content: "Altas", colSpan: 4, styles: { fontStyle: "bold" } }]);
        s.additions.forEach((m) => {
          body.push([
            m.asset.asset_name,
            m.asset.asset_code,
            formatDateEs(m.date),
            { content: `Q ${fmt(m.amount)}`, styles: { halign: "right" } },
          ]);
        });
      }
      if (s.disposals.length > 0) {
        body.push([{ content: "Bajas", colSpan: 4, styles: { fontStyle: "bold" } }]);
        s.disposals.forEach((m) => {
          body.push([
            m.reason ? `${m.asset.asset_name} (${m.reason})` : m.asset.asset_name,
            m.asset.asset_code,
            formatDateEs(m.date),
            { content: `Q ${fmt(m.amount)}`, styles: { halign: "right" } },
          ]);
        });
      }
      body.push([
        { content: "Saldo Final de Categoría", colSpan: 3, styles: { fontStyle: "bold" } },
        { content: `Q ${fmt(s.closingBalance)}`, styles: { fontStyle: "bold", halign: "right" } },
      ]);
      body.push([{ content: "", colSpan: 4, styles: { minCellHeight: 3 } }]);
    });

    autoTable(doc, {
      startY,
      head: [["Descripción", "Código", "Fecha", "Monto"]],
      body,
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: { 3: { halign: "right" } },
    });

    const finalY = getAutoTableFinalY(doc) + 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Totales Generales", 14, finalY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Saldos Iniciales: Q ${fmt(totals.opening)}`, 14, finalY + 6);
    doc.text(`Altas: Q ${fmt(totals.additions)}`, 14, finalY + 11);
    doc.text(`Bajas: Q ${fmt(totals.disposals)}`, 14, finalY + 16);
    doc.text(`Saldos Finales: Q ${fmt(totals.closing)}`, 14, finalY + 21);

    previewPdfDoc(doc, `Altas_y_Bajas_${startDate}_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Altas y Bajas por Período</CardTitle>
          <CardDescription>Movimientos de activos fijos agrupados por categoría en un rango de fechas.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Desde</Label>
              <Input type="date" className="w-48" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" className="w-48" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <Button variant="outline" onClick={exportPdf} disabled={sections.length === 0}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando reporte...
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          Sin movimientos de activos fijos en el período seleccionado.
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((s) => (
            <Card key={s.category.id}>
              <CardHeader>
                <CardTitle className="text-base">{s.category.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell colSpan={3}>Saldo Inicial de Categoría</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(s.openingBalance)}</TableCell>
                    </TableRow>
                    {s.additions.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="font-semibold text-sm text-muted-foreground">
                          Altas
                        </TableCell>
                      </TableRow>
                    )}
                    {s.additions.map((m) => (
                      <TableRow key={`add-${m.asset.id}`}>
                        <TableCell>{m.asset.asset_name}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{m.asset.asset_code}</TableCell>
                        <TableCell>{formatDateEs(m.date)}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                          Q {fmt(m.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {s.disposals.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="font-semibold text-sm text-muted-foreground">
                          Bajas
                        </TableCell>
                      </TableRow>
                    )}
                    {s.disposals.map((m) => (
                      <TableRow key={`dis-${m.asset.id}`}>
                        <TableCell>
                          {m.asset.asset_name}
                          {m.reason && <span className="text-muted-foreground text-xs"> ({m.reason})</span>}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">{m.asset.asset_code}</TableCell>
                        <TableCell>{formatDateEs(m.date)}</TableCell>
                        <TableCell className="text-right font-mono text-red-700 dark:text-red-400">
                          Q {fmt(m.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell colSpan={3}>Saldo Final de Categoría</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(s.closingBalance)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Totales Generales</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Saldos Iniciales", value: totals.opening },
                { label: "Altas", value: totals.additions },
                { label: "Bajas", value: totals.disposals },
                { label: "Saldos Finales", value: totals.closing },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <p className="font-mono font-semibold">Q {fmt(value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

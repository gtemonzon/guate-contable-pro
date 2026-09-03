import { Fragment, useMemo, useState } from "react";
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
  useAssetCategories,
  useAllDepreciationSchedule,
  type FixedAsset,
  type FixedAssetCategory,
  type DepreciationScheduleForReports,
} from "@/hooks/useFixedAssets";
import {
  fmt,
  formatDateEs,
  parseDateParts,
  isPresentAtStart,
  disposalDateOnly,
  sumDepreciationBefore,
  sumDepreciationUpTo,
  sumDepreciationWithin,
} from "./reportShared";
import { drawAssetReportHeader } from "./reportPdfHelpers";

interface Props {
  enterpriseId: number;
  enterpriseName: string;
  enterpriseNit: string;
}

interface LedgerSection {
  category: FixedAssetCategory;
  cost: { opening: number; debit: number; credit: number; closing: number };
  depreciation: { opening: number; debit: number; credit: number; closing: number };
}

function buildSections(
  assets: FixedAsset[],
  categories: FixedAssetCategory[],
  scheduleByAsset: Map<number, DepreciationScheduleForReports[]>,
  startDate: string,
  endDate: string,
): LedgerSection[] {
  const { year: startYear, month: startMonth } = parseDateParts(startDate);
  const { year: endYear, month: endMonth } = parseDateParts(endDate);

  return categories
    .map((category) => {
      const categoryAssets = assets.filter((a) => a.category_id === category.id);
      const presentAtStart = categoryAssets.filter((a) => isPresentAtStart(a, startDate));
      const acquiredInPeriod = categoryAssets.filter(
        (a) => a.acquisition_date >= startDate && a.acquisition_date <= endDate,
      );
      const disposedInPeriod = categoryAssets.filter((a) => {
        if (!a.disposed_at) return false;
        const d = disposalDateOnly(a.disposed_at);
        return d >= startDate && d <= endDate;
      });

      const costOpening = presentAtStart.reduce((sum, a) => sum + a.acquisition_cost, 0);
      const costDebit = acquiredInPeriod.reduce((sum, a) => sum + a.acquisition_cost, 0);
      const costCredit = disposedInPeriod.reduce((sum, a) => sum + a.acquisition_cost, 0);
      const costClosing = costOpening + costDebit - costCredit;

      const depOpening = presentAtStart.reduce(
        (sum, a) => sum + sumDepreciationBefore(scheduleByAsset.get(a.id) ?? [], startYear, startMonth),
        0,
      );
      const depDebit = disposedInPeriod.reduce((sum, a) => {
        const { year, month } = parseDateParts(disposalDateOnly(a.disposed_at as string));
        return sum + sumDepreciationUpTo(scheduleByAsset.get(a.id) ?? [], year, month);
      }, 0);
      // "TODOS los activos de la categoría": no se filtra por presencia — incluye
      // altas y bajas del mismo período, cada uno aportando solo sus meses reales.
      const depCredit = categoryAssets.reduce(
        (sum, a) =>
          sum + sumDepreciationWithin(scheduleByAsset.get(a.id) ?? [], startYear, startMonth, endYear, endMonth),
        0,
      );
      const depClosing = depOpening - depDebit + depCredit;

      return {
        category,
        cost: { opening: costOpening, debit: costDebit, credit: costCredit, closing: costClosing },
        depreciation: { opening: depOpening, debit: depDebit, credit: depCredit, closing: depClosing },
      };
    })
    .filter(
      (s) =>
        s.cost.opening !== 0 ||
        s.cost.debit !== 0 ||
        s.cost.credit !== 0 ||
        s.depreciation.opening !== 0 ||
        s.depreciation.debit !== 0 ||
        s.depreciation.credit !== 0,
    );
}

export default function AssetLedgerReport({ enterpriseId, enterpriseName, enterpriseNit }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(`${today.slice(0, 4)}-01-01`);
  const [endDate, setEndDate] = useState(today);

  const { data: assets = [], isLoading: assetsLoading } = useFixedAssets(enterpriseId);
  const { data: categories = [], isLoading: categoriesLoading } = useAssetCategories(enterpriseId);
  const { data: scheduleRows = [], isLoading: scheduleLoading } = useAllDepreciationSchedule(enterpriseId);
  const isLoading = assetsLoading || categoriesLoading || scheduleLoading;

  const scheduleByAsset = useMemo(() => {
    const map = new Map<number, DepreciationScheduleForReports[]>();
    for (const row of scheduleRows) {
      const list = map.get(row.asset_id) ?? [];
      list.push(row);
      map.set(row.asset_id, list);
    }
    return map;
  }, [scheduleRows]);

  const sections = useMemo(
    () => buildSections(assets, categories, scheduleByAsset, startDate, endDate),
    [assets, categories, scheduleByAsset, startDate, endDate],
  );

  const costTotals = sections.reduce(
    (acc, s) => ({
      opening: acc.opening + s.cost.opening,
      debit: acc.debit + s.cost.debit,
      credit: acc.credit + s.cost.credit,
      closing: acc.closing + s.cost.closing,
    }),
    { opening: 0, debit: 0, credit: 0, closing: 0 },
  );
  const depreciationTotals = sections.reduce(
    (acc, s) => ({
      opening: acc.opening + s.depreciation.opening,
      debit: acc.debit + s.depreciation.debit,
      credit: acc.credit + s.depreciation.credit,
      closing: acc.closing + s.depreciation.closing,
    }),
    { opening: 0, debit: 0, credit: 0, closing: 0 },
  );

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    const startY = drawAssetReportHeader(doc, {
      enterpriseName,
      enterpriseNit,
      title: `Mayor de Activos Fijos — Del ${formatDateEs(startDate)} al ${formatDateEs(endDate)}`,
    });

    const body: (string | number)[][] = [];
    sections.forEach((s) => {
      body.push([
        s.category.name,
        `Q ${fmt(s.cost.opening)}`,
        `Q ${fmt(s.cost.debit)}`,
        `Q ${fmt(s.cost.credit)}`,
        `Q ${fmt(s.cost.closing)}`,
      ]);
      body.push([
        `Depreciación ${s.category.name}`,
        `Q ${fmt(s.depreciation.opening)}`,
        `Q ${fmt(s.depreciation.debit)}`,
        `Q ${fmt(s.depreciation.credit)}`,
        `Q ${fmt(s.depreciation.closing)}`,
      ]);
    });

    autoTable(doc, {
      startY,
      head: [["Cuenta", "Saldo Inicial", "Debe", "Haber", "Saldo Final"]],
      body,
      foot: [
        [
          "Totales Generales — Costo",
          `Q ${fmt(costTotals.opening)}`,
          `Q ${fmt(costTotals.debit)}`,
          `Q ${fmt(costTotals.credit)}`,
          `Q ${fmt(costTotals.closing)}`,
        ],
        [
          "Totales Generales — Depreciación",
          `Q ${fmt(depreciationTotals.opening)}`,
          `Q ${fmt(depreciationTotals.debit)}`,
          `Q ${fmt(depreciationTotals.credit)}`,
          `Q ${fmt(depreciationTotals.closing)}`,
        ],
      ],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: "bold" },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
    });

    previewPdfDoc(doc, `Mayor_Activos_Fijos_${startDate}_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Mayor de Activos Fijos</CardTitle>
          <CardDescription>
            Saldo inicial, movimientos y saldo final de costo y depreciación acumulada, por categoría.
          </CardDescription>
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
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="text-right">Saldo Inicial</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sections.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      Sin actividad de activos fijos en el período seleccionado.
                    </TableCell>
                  </TableRow>
                )}
                {sections.map((s) => (
                  <Fragment key={s.category.id}>
                    <TableRow>
                      <TableCell className="font-medium">{s.category.name}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(s.cost.opening)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(s.cost.debit)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(s.cost.credit)}</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{fmt(s.cost.closing)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground text-sm">Depreciación {s.category.name}</TableCell>
                      <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">
                        {fmt(s.depreciation.opening)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">
                        {fmt(s.depreciation.debit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">
                        {fmt(s.depreciation.credit)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold text-amber-700 dark:text-amber-400">
                        {fmt(s.depreciation.closing)}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
                {sections.length > 0 && (
                  <>
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Totales Generales — Costo</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(costTotals.opening)}</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(costTotals.debit)}</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(costTotals.credit)}</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(costTotals.closing)}</TableCell>
                    </TableRow>
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Totales Generales — Depreciación</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(depreciationTotals.opening)}</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(depreciationTotals.debit)}</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(depreciationTotals.credit)}</TableCell>
                      <TableCell className="text-right font-mono">Q {fmt(depreciationTotals.closing)}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

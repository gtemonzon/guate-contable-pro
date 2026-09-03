import { useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileDown, ChevronsUpDown } from "lucide-react";
import { previewPdfDoc } from "@/lib/pdfPreview";
import {
  useFixedAssets,
  useAssetCategories,
  useAllDepreciationSchedule,
  type FixedAsset,
  type DepreciationScheduleForReports,
} from "@/hooks/useFixedAssets";
import { fmt, formatDateEs, MONTH_NAMES, parseDateParts, periodKey, sumDepreciationUpTo } from "./reportShared";
import { drawAssetReportHeader } from "./reportPdfHelpers";

interface Props {
  enterpriseId: number;
  enterpriseName: string;
  enterpriseNit: string;
}

interface KardexData {
  asset: FixedAsset;
  categoryName: string;
  accumulatedDepreciation: number;
  netBookValue: number;
  years: number[];
  amountFor: (year: number, month: number) => number | null;
  yearTotal: (year: number) => number;
}

function amountForRow(row: DepreciationScheduleForReports): number {
  return row.status === "POSTED" ? row.posted_depreciation_amount ?? 0 : row.planned_depreciation_amount;
}

function buildKardex(
  asset: FixedAsset,
  categoryName: string,
  scheduleRows: DepreciationScheduleForReports[],
  asOfDate: string,
): KardexData {
  const { year: cutoffYear, month: cutoffMonth } = parseDateParts(asOfDate);
  const cutoffKey = periodKey(cutoffYear, cutoffMonth);

  const byPeriod = new Map<number, DepreciationScheduleForReports>();
  let minYear = cutoffYear;
  let maxYear = cutoffYear;
  scheduleRows.forEach((row, idx) => {
    byPeriod.set(periodKey(row.year, row.month), row);
    if (idx === 0) {
      minYear = row.year;
      maxYear = row.year;
    } else {
      minYear = Math.min(minYear, row.year);
      maxYear = Math.max(maxYear, row.year);
    }
  });

  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  const amountFor = (year: number, month: number): number | null => {
    if (periodKey(year, month) > cutoffKey) return null;
    const row = byPeriod.get(periodKey(year, month));
    return row ? amountForRow(row) : null;
  };

  const yearTotal = (year: number): number => {
    let total = 0;
    for (let m = 1; m <= 12; m++) total += amountFor(year, m) ?? 0;
    return total;
  };

  return {
    asset,
    categoryName,
    accumulatedDepreciation: sumDepreciationUpTo(scheduleRows, cutoffYear, cutoffMonth),
    netBookValue: asset.acquisition_cost - sumDepreciationUpTo(scheduleRows, cutoffYear, cutoffMonth),
    years,
    amountFor,
    yearTotal,
  };
}

export default function AssetKardexReport({ enterpriseId, enterpriseName, enterpriseNit }: Props) {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const { data: assets = [], isLoading: assetsLoading } = useFixedAssets(enterpriseId);
  const { data: categories = [] } = useAssetCategories(enterpriseId);
  const { data: scheduleRows = [], isLoading: scheduleLoading } = useAllDepreciationSchedule(enterpriseId);
  const isLoading = assetsLoading || scheduleLoading;

  const categoryNameById = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const scheduleByAsset = useMemo(() => {
    const map = new Map<number, DepreciationScheduleForReports[]>();
    for (const row of scheduleRows) {
      const list = map.get(row.asset_id) ?? [];
      list.push(row);
      map.set(row.asset_id, list);
    }
    map.forEach((rows) => rows.sort((a, b) => periodKey(a.year, a.month) - periodKey(b.year, b.month)));
    return map;
  }, [scheduleRows]);

  const assetsWithSchedule = useMemo(
    () => assets.filter((a) => a.status !== "DRAFT" && (scheduleByAsset.get(a.id) ?? []).length > 0),
    [assets, scheduleByAsset],
  );

  const toggleAsset = (assetId: number) => {
    setSelectedAssetIds((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]));
  };

  const toggleAll = () => {
    const allSelected = assetsWithSchedule.every((a) => selectedAssetIds.includes(a.id));
    setSelectedAssetIds(allSelected ? [] : assetsWithSchedule.map((a) => a.id));
  };

  const selectedKardexes = useMemo<KardexData[]>(() => {
    return assetsWithSchedule
      .filter((a) => selectedAssetIds.includes(a.id))
      .map((a) => buildKardex(a, a.category?.name ?? categoryNameById.get(a.category_id) ?? "—", scheduleByAsset.get(a.id) ?? [], asOfDate))
      .sort((a, b) => a.asset.asset_code.localeCompare(b.asset.asset_code));
  }, [assetsWithSchedule, selectedAssetIds, scheduleByAsset, asOfDate, categoryNameById]);

  const exportPdf = () => {
    if (selectedKardexes.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape" });

    selectedKardexes.forEach((k, idx) => {
      if (idx > 0) doc.addPage();
      const startY = drawAssetReportHeader(doc, {
        enterpriseName,
        enterpriseNit,
        title: `Kardex de Activo Fijo — Al ${formatDateEs(asOfDate)}`,
      });

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      const infoLines = [
        `Código: ${k.asset.asset_code}      Nombre: ${k.asset.asset_name}      Categoría: ${k.categoryName}`,
        `Fecha de adquisición: ${formatDateEs(k.asset.acquisition_date)}      Costo de adquisición: Q ${fmt(k.asset.acquisition_cost)}      Vida útil: ${k.asset.useful_life_months} meses`,
        `Depreciación acumulada a la fecha: Q ${fmt(k.accumulatedDepreciation)}      Valor en libros a la fecha: Q ${fmt(k.netBookValue)}`,
      ];
      infoLines.forEach((line, i) => doc.text(line, 14, startY + i * 5));

      const tableStartY = startY + infoLines.length * 5 + 4;
      const head = [["Mes", ...k.years.map((y) => String(y))]];
      const body = MONTH_NAMES.slice(1).map((name, i) => {
        const month = i + 1;
        return [
          name,
          ...k.years.map((y) => {
            const amount = k.amountFor(y, month);
            return amount === null ? "" : fmt(amount);
          }),
        ];
      });
      const totalsRow = ["Total", ...k.years.map((y) => fmt(k.yearTotal(y)))];

      autoTable(doc, {
        startY: tableStartY,
        head,
        body,
        foot: [totalsRow],
        styles: { font: "helvetica", fontSize: 8, cellPadding: 1.5, halign: "right" },
        columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        footStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: "bold" },
      });
    });

    previewPdfDoc(doc, `Kardex_Activos_${asOfDate}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Kardex de Activos Fijos</CardTitle>
          <CardDescription>Historial mensual de depreciación por activo, una página por cada uno.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Activos</Label>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-64 justify-between">
                    {selectedAssetIds.length === 0
                      ? "Seleccionar activos..."
                      : selectedAssetIds.length === assetsWithSchedule.length
                        ? "Todos los activos"
                        : `${selectedAssetIds.length} activo(s)`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar activo..." />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>No se encontraron activos.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={toggleAll}>
                          <Checkbox
                            checked={assetsWithSchedule.length > 0 && assetsWithSchedule.every((a) => selectedAssetIds.includes(a.id))}
                            className="mr-2"
                          />
                          <span className="font-semibold">Todos</span>
                        </CommandItem>
                        {assetsWithSchedule.map((asset) => (
                          <CommandItem
                            key={asset.id}
                            value={`${asset.asset_code} ${asset.asset_name}`}
                            onSelect={() => toggleAsset(asset.id)}
                          >
                            <Checkbox checked={selectedAssetIds.includes(asset.id)} className="mr-2" />
                            <span className="font-mono text-xs mr-2">{asset.asset_code}</span>
                            <span className="truncate">{asset.asset_name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Fecha de corte</Label>
              <Input type="date" className="w-48" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            </div>
            <Button variant="outline" onClick={exportPdf} disabled={selectedKardexes.length === 0}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando activos...
        </div>
      ) : selectedKardexes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          Selecciona uno o varios activos para ver su kardex.
        </div>
      ) : (
        <div className="space-y-6">
          {selectedKardexes.map((k) => (
            <Card key={k.asset.id}>
              <CardHeader>
                <CardTitle className="text-base flex flex-wrap items-center gap-2">
                  <span className="font-mono text-muted-foreground">{k.asset.asset_code}</span>
                  {k.asset.asset_name}
                </CardTitle>
                <CardDescription className="space-y-0.5">
                  <p>
                    Categoría: {k.categoryName} · Adquisición: {formatDateEs(k.asset.acquisition_date)} · Costo: Q{" "}
                    {fmt(k.asset.acquisition_cost)} · Vida útil: {k.asset.useful_life_months} meses
                  </p>
                  <p>
                    Depreciación acumulada a la fecha: Q {fmt(k.accumulatedDepreciation)} · Valor en libros a la fecha: Q{" "}
                    {fmt(k.netBookValue)}
                  </p>
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      {k.years.map((y) => (
                        <TableHead key={y} className="text-right">
                          {y}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MONTH_NAMES.slice(1).map((name, i) => {
                      const month = i + 1;
                      return (
                        <TableRow key={month}>
                          <TableCell className="font-medium">{name}</TableCell>
                          {k.years.map((y) => {
                            const amount = k.amountFor(y, month);
                            return (
                              <TableCell key={y} className="text-right font-mono">
                                {amount === null ? "" : fmt(amount)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    <TableRow className="font-semibold bg-muted/30">
                      <TableCell>Total</TableCell>
                      {k.years.map((y) => (
                        <TableCell key={y} className="text-right font-mono">
                          {fmt(k.yearTotal(y))}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

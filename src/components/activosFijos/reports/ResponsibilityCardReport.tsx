import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileDown, FileSpreadsheet, ChevronsUpDown, ChevronRight } from "lucide-react";
import { previewPdfDoc } from "@/lib/pdfPreview";
import {
  useAssetCustodians,
  useOpenCustodianAssignmentsByEnterprise,
  useFixedAssets,
  type FixedAsset,
  type FixedAssetCustodian,
  type OpenCustodianAssignmentForReport,
} from "@/hooks/useFixedAssets";
import { formatDateEs } from "./reportShared";
import { drawAssetReportHeader, getAutoTableFinalY, noFillTableStyle } from "./reportPdfHelpers";
import AssetDetailDialog from "../AssetDetailDialog";

interface Props {
  enterpriseId: number;
  enterpriseName: string;
  enterpriseNit: string;
}

interface CustodianCardData {
  custodian: FixedAssetCustodian;
  assignments: OpenCustodianAssignmentForReport[];
}

/**
 * Sanitiza y trunca un nombre de custodio para usarlo como nombre de hoja de
 * Excel: sin los caracteres inválidos de Excel ([]:*?/\), máximo 31
 * caracteres, y deduplicado si dos custodios truncan al mismo nombre.
 */
function sanitizeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, "").trim().slice(0, 31) || "Custodio";
  let candidate = base;
  let n = 1;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  used.add(candidate);
  return candidate;
}

export default function ResponsibilityCardReport({ enterpriseId, enterpriseName, enterpriseNit }: Props) {
  const queryClient = useQueryClient();
  const [selectedCustodianIds, setSelectedCustodianIds] = useState<number[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [detailAsset, setDetailAsset] = useState<FixedAsset | null>(null);

  const { data: custodians = [], isLoading: custodiansLoading } = useAssetCustodians(enterpriseId);
  const { data: openAssignments = [], isLoading: assignmentsLoading } = useOpenCustodianAssignmentsByEnterprise(enterpriseId);
  // Ya se pide en otros reportes de esta carpeta (Kardex, Mayor, etc.) para la
  // misma empresa, así que normalmente ya está en caché de React Query.
  const { data: allAssets = [] } = useFixedAssets(enterpriseId);
  const isLoading = custodiansLoading || assignmentsLoading;

  const assignmentsByCustodian = useMemo(() => {
    const map = new Map<number, OpenCustodianAssignmentForReport[]>();
    for (const a of openAssignments) {
      const list = map.get(a.custodian_id) ?? [];
      list.push(a);
      map.set(a.custodian_id, list);
    }
    map.forEach((rows) => rows.sort((a, b) => a.assigned_date.localeCompare(b.assigned_date)));
    return map;
  }, [openAssignments]);

  // Solo custodios con al menos una asignación abierta — no tiene sentido
  // ofrecer una tarjeta vacía para alguien sin activos a su cargo.
  const custodiansWithAssignments = useMemo(
    () => custodians.filter((c) => (assignmentsByCustodian.get(c.id) ?? []).length > 0),
    [custodians, assignmentsByCustodian],
  );

  const toggleCustodian = (id: number) => {
    setSelectedCustodianIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    const allSelected = custodiansWithAssignments.every((c) => selectedCustodianIds.includes(c.id));
    setSelectedCustodianIds(allSelected ? [] : custodiansWithAssignments.map((c) => c.id));
  };

  const selectedCards = useMemo<CustodianCardData[]>(() => {
    return custodiansWithAssignments
      .filter((c) => selectedCustodianIds.includes(c.id))
      .map((c) => ({ custodian: c, assignments: assignmentsByCustodian.get(c.id) ?? [] }))
      .sort((a, b) => a.custodian.name.localeCompare(b.custodian.name));
  }, [custodiansWithAssignments, selectedCustodianIds, assignmentsByCustodian]);

  // Un solo custodio seleccionado: arranca expandido. Dos o más: todos
  // colapsados, para que el usuario vea de un vistazo la lista y sus
  // conteos antes de abrir el que le interese. Se recalcula en cada cambio
  // de selección (no al reordenar/actualizar los datos de los ya elegidos).
  useEffect(() => {
    setExpandedIds(selectedCustodianIds.length === 1 ? new Set(selectedCustodianIds) : new Set());
  }, [selectedCustodianIds]);

  const toggleExpanded = (custodianId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(custodianId)) next.delete(custodianId);
      else next.add(custodianId);
      return next;
    });
  };

  const allExpanded = selectedCards.length > 0 && selectedCards.every((c) => expandedIds.has(c.custodian.id));
  const toggleExpandAll = () => {
    setExpandedIds(allExpanded ? new Set() : new Set(selectedCards.map((c) => c.custodian.id)));
  };

  const openAssetDetail = (assetId: number) => {
    const full = allAssets.find((a) => a.id === assetId);
    if (full) setDetailAsset(full);
  };

  const closeAssetDetail = () => {
    setDetailAsset(null);
    // El diálogo permite editar datos del activo y gestionar custodios
    // (asignar/entregar) — invalidar aquí evita que el reporte quede
    // mostrando datos obsoletos sin importar qué se haya cambiado adentro.
    queryClient.invalidateQueries({ queryKey: ["open_custodian_assignments", enterpriseId] });
  };

  const exportPdf = () => {
    if (selectedCards.length === 0) return;
    const doc = new jsPDF({ orientation: "landscape" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const blockWidth = 75;

    selectedCards.forEach((card, idx) => {
      if (idx > 0) doc.addPage();
      const startY = drawAssetReportHeader(doc, {
        enterpriseName,
        enterpriseNit,
        title: "Tarjeta de Responsabilidad de Activos Fijos",
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Custodio: ${card.custodian.name}`, margin, startY);
      doc.setFont("helvetica", "normal");

      autoTable(doc, {
        startY: startY + 6,
        head: [["Código", "Categoría", "Nombre", "Fecha de Asignación"]],
        body: card.assignments.map((a) => [
          a.asset?.asset_code ?? "—",
          a.asset?.category?.name ?? "—",
          a.asset?.asset_name ?? "—",
          formatDateEs(a.assigned_date),
        ]),
        styles: { font: "helvetica", fontSize: 9, cellPadding: 2 },
        headStyles: noFillTableStyle,
      });

      const tableEndY = getAutoTableFinalY(doc);
      const labelY = tableEndY + 15;
      const lineY = labelY + 18;
      const leftX1 = margin;
      const leftX2 = margin + blockWidth;
      const rightX2 = pageWidth - margin;
      const rightX1 = rightX2 - blockWidth;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Entregado por:", leftX1, labelY);
      doc.text(`Recibido por: ${card.custodian.name}`, rightX1, labelY);

      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(leftX1, lineY, leftX2, lineY);
      doc.line(rightX1, lineY, rightX2, lineY);
    });

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    }

    previewPdfDoc(doc, `Tarjeta_Responsabilidad_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  // Una hoja por custodio: se eligió sobre una sola hoja con columna
  // "Custodio" porque cada hoja mapea 1:1 con la hoja física/página del PDF
  // que ese custodio firmaría — más útil para imprimir o enviar por
  // separado a cada colaborador.
  const exportExcel = () => {
    if (selectedCards.length === 0) return;
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();

    selectedCards.forEach((card) => {
      const rows: (string | number)[][] = [
        [`Tarjeta de Responsabilidad — ${card.custodian.name}`],
        [],
        ["Código", "Categoría", "Nombre", "Fecha de Asignación"],
        ...card.assignments.map((a) => [
          a.asset?.asset_code ?? "—",
          a.asset?.category?.name ?? "—",
          a.asset?.asset_name ?? "—",
          formatDateEs(a.assigned_date),
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = [{ wch: 14 }, { wch: 22 }, { wch: 32 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(card.custodian.name, usedNames));
    });

    XLSX.writeFile(wb, `Tarjeta_Responsabilidad_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tarjeta de Responsabilidad</CardTitle>
          <CardDescription>
            Documento para que cada custodio firme los activos que tiene actualmente a su cargo — una hoja por
            custodio, con espacio de firma de entrega y recepción.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-64 justify-between">
                    {selectedCustodianIds.length === 0
                      ? "Seleccionar custodios..."
                      : selectedCustodianIds.length === custodiansWithAssignments.length
                        ? "Todos los custodios"
                        : `${selectedCustodianIds.length} custodio(s)`}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar custodio..." />
                    <CommandList className="max-h-[300px]">
                      <CommandEmpty>No se encontraron custodios con activos asignados.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem onSelect={toggleAll}>
                          <Checkbox
                            checked={custodiansWithAssignments.length > 0 && custodiansWithAssignments.every((c) => selectedCustodianIds.includes(c.id))}
                            className="mr-2"
                          />
                          <span className="font-semibold">Todos</span>
                        </CommandItem>
                        {custodiansWithAssignments.map((custodian) => (
                          <CommandItem key={custodian.id} value={custodian.name} onSelect={() => toggleCustodian(custodian.id)}>
                            <Checkbox checked={selectedCustodianIds.includes(custodian.id)} className="mr-2" />
                            <span className="truncate">{custodian.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button variant="outline" onClick={exportPdf} disabled={selectedCards.length === 0}>
              <FileDown className="h-4 w-4 mr-1" /> Exportar PDF
            </Button>
            <Button variant="outline" onClick={exportExcel} disabled={selectedCards.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando custodios...
        </div>
      ) : selectedCards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          Selecciona uno o varios custodios para ver sus activos asignados.
        </div>
      ) : (
        <div className="space-y-4">
          {selectedCards.length > 1 && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={toggleExpandAll}>
                {allExpanded ? "Colapsar todo" : "Expandir todo"}
              </Button>
            </div>
          )}
          <div className="space-y-6">
            {selectedCards.map((card) => {
              const isExpanded = expandedIds.has(card.custodian.id);
              return (
                <Collapsible key={card.custodian.id} open={isExpanded} onOpenChange={() => toggleExpanded(card.custodian.id)} asChild>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer select-none flex-row items-center justify-between space-y-0">
                        <div>
                          <CardTitle className="text-base">{card.custodian.name}</CardTitle>
                          <CardDescription>{card.assignments.length} activo(s) actualmente a su cargo</CardDescription>
                        </div>
                        <ChevronRight className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="p-0 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Código</TableHead>
                              <TableHead>Categoría</TableHead>
                              <TableHead>Nombre</TableHead>
                              <TableHead>Fecha de Asignación</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {card.assignments.map((a) => (
                              <TableRow
                                key={a.id}
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => openAssetDetail(a.asset_id)}
                              >
                                <TableCell className="font-mono">{a.asset?.asset_code ?? "—"}</TableCell>
                                <TableCell className="text-muted-foreground">{a.asset?.category?.name ?? "—"}</TableCell>
                                <TableCell>{a.asset?.asset_name ?? "—"}</TableCell>
                                <TableCell>{formatDateEs(a.assigned_date)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        </div>
      )}

      {detailAsset && (
        <AssetDetailDialog asset={detailAsset} open={!!detailAsset} onClose={closeAssetDetail} />
      )}
    </div>
  );
}

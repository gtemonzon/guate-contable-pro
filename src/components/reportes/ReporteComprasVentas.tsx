/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import jsPDF from "jspdf";
import autoTable, { type Styles, type RowInput } from "jspdf-autotable";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getSafeErrorMessage } from "@/utils/errorMessages";
import { formatCurrency } from "@/lib/utils";
import { useEnterpriseTaxRegime } from "@/hooks/useEnterpriseTaxRegime";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { previewPdfDoc } from "@/lib/pdfPreview";

interface PurchaseRow {
  invoice_date: string;
  invoice_series: string;
  invoice_number: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
}

interface SaleRow {
  invoice_date: string;
  invoice_series: string;
  invoice_number: string;
  customer_nit: string;
  customer_name: string;
  total_amount: number;
  is_annulled?: boolean;
}

// Sin relleno de color — mismo criterio económico de impresión que el Libro Diario
// (negrita + línea delgada negra en vez de un fondo de color).
const noFillTableStyle: Partial<Styles> = {
  fillColor: false,
  textColor: 0,
  fontStyle: "bold",
  lineWidth: 0.2,
  lineColor: [0, 0, 0],
};

// Fecha | Serie | No. Doc | NIT | Proveedor/Cliente | Monto — mismas columnas y
// anchos en Compras y Ventas para que ambas secciones se vean simétricas. El
// nombre queda más angosto (hace wrap) para dejar espacio a la columna Serie.
const purchaseSaleColumnStyles: Record<number, Partial<Styles>> = {
  0: { cellWidth: 16 },
  1: { cellWidth: 10 },
  2: { cellWidth: 16 },
  3: { cellWidth: 18 },
  4: { cellWidth: 40 },
  5: { halign: "right" },
};

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function ReporteComprasVentas() {
  const [currentEnterpriseId, setCurrentEnterpriseId] = useState<string | null>(null);
  const [enterpriseName, setEnterpriseName] = useState("");
  const [enterpriseNit, setEnterpriseNit] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [reportGenerated, setReportGenerated] = useState(false);
  const { toast } = useToast();
  const { strategy } = useEnterpriseTaxRegime();

  useEffect(() => {
    const id = localStorage.getItem("currentEnterpriseId");
    setCurrentEnterpriseId(id);
    if (id) {
      supabase
        .from("tab_enterprises")
        .select("business_name, nit")
        .eq("id", parseInt(id))
        .single()
        .then(({ data }) => {
          setEnterpriseName(data?.business_name ?? "");
          setEnterpriseNit(data?.nit ?? "");
        });
    }
  }, []);

  const totals = useMemo(() => {
    const activeSales = sales.filter(s => !s.is_annulled);
    return {
      totalPurchases: purchases.reduce((s, p) => s + (Number(p.total_amount) || 0), 0),
      totalSales: activeSales.reduce((s, v) => s + (Number(v.total_amount) || 0), 0),
      purchaseCount: purchases.length,
      saleCount: activeSales.length,
    };
  }, [purchases, sales]);

  const generateReport = async () => {
    if (!currentEnterpriseId) {
      toast({ title: "Error", description: "Selecciona una empresa primero", variant: "destructive" });
      return;
    }
    try {
      setLoading(true);
      const start = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split("T")[0];
      const end = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0];
      const eid = parseInt(currentEnterpriseId);

      const [p, s] = await Promise.all([
        fetchAllRecords<any>(
          supabase.from("tab_purchase_ledger")
            .select("invoice_date, invoice_series, invoice_number, supplier_nit, supplier_name, total_amount")
            .eq("enterprise_id", eid)
            .gte("invoice_date", start).lte("invoice_date", end)
            .order("invoice_date", { ascending: true })
            .order("invoice_number", { ascending: true })
        ),
        fetchAllRecords<any>(
          supabase.from("tab_sales_ledger")
            .select("invoice_date, invoice_series, invoice_number, customer_nit, customer_name, total_amount, is_annulled")
            .eq("enterprise_id", eid)
            .gte("invoice_date", start).lte("invoice_date", end)
            .order("invoice_date", { ascending: true })
            .order("invoice_number", { ascending: true })
        ),
      ]);
      setPurchases(p || []);
      setSales(s || []);
      setReportGenerated(true);
      if ((!p || p.length === 0) && (!s || s.length === 0)) {
        toast({ title: "Sin datos", description: "No hay registros para el período seleccionado" });
      }
    } catch (error) {
      toast({ title: "Error al generar reporte", description: getSafeErrorMessage(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const periodLabel = `${monthNames[selectedMonth - 1]} ${selectedYear}`;
  const filenameBase = `Libro_Compras_Ventas_${monthNames[selectedMonth - 1]}_${selectedYear}`;

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(enterpriseName, margin, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`NIT: ${enterpriseNit}    Régimen: ${strategy.label}`, margin, 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Libro de Compras y Ventas — ${periodLabel}`, pageWidth / 2, 24, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    const half = (pageWidth - margin * 3) / 2;
    const leftX = margin;
    const rightX = margin + half + margin;
    const tableStartY = 30;

    // Purchases (left)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("COMPRAS", leftX, tableStartY - 2);
    autoTable(doc, {
      startY: tableStartY,
      margin: { left: leftX, right: pageWidth - (leftX + half) },
      tableWidth: half,
      head: [["Fecha", "Serie", "No. Doc", "NIT", "Proveedor", "Monto"]],
      body: purchases.length === 0
        ? [[{ content: "SIN MOVIMIENTOS", colSpan: 6, styles: { halign: "center", fontStyle: "italic" } }]]
        : purchases.map(p => [
        new Date(p.invoice_date + "T00:00:00").toLocaleDateString("es-GT"),
        p.invoice_series,
        p.invoice_number,
        p.supplier_nit,
        p.supplier_name,
        `Q ${formatCurrency(Number(p.total_amount) || 0)}`,
      ]),
      foot: [[
        { content: "Subtotal Compras", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
        { content: `Q ${formatCurrency(totals.totalPurchases)}`, styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { font: "helvetica", fontSize: 7, cellPadding: 1.5 },
      headStyles: noFillTableStyle,
      footStyles: noFillTableStyle,
      columnStyles: purchaseSaleColumnStyles,
    });

    // Sales (right)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("VENTAS", rightX, tableStartY - 2);
    const activeSalesForPdf = sales.filter(s => !s.is_annulled);
    const salesBody: RowInput[] = activeSalesForPdf.length === 0
      ? [[{ content: "SIN MOVIMIENTOS", colSpan: 6, styles: { halign: "center", fontStyle: "italic" } }]]
      : activeSalesForPdf.map(s => [
        new Date(s.invoice_date + "T00:00:00").toLocaleDateString("es-GT"),
        s.invoice_series,
        s.invoice_number,
        s.customer_nit || "C/F",
        s.customer_name || "Consumidor Final",
        `Q ${formatCurrency(Number(s.total_amount) || 0)}`,
      ]);
    autoTable(doc, {
      startY: tableStartY,
      margin: { left: rightX, right: margin },
      tableWidth: half,
      head: [["Fecha", "Serie", "No. Doc", "NIT", "Cliente", "Monto"]],
      body: salesBody,
      foot: [[
        { content: "Subtotal Ventas", colSpan: 5, styles: { halign: "right", fontStyle: "bold" } },
        { content: `Q ${formatCurrency(totals.totalSales)}`, styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { font: "helvetica", fontSize: 7, cellPadding: 1.5 },
      headStyles: noFillTableStyle,
      footStyles: noFillTableStyle,
      columnStyles: purchaseSaleColumnStyles,
    });

    // Footer totals on last page
    const lastPage = doc.getNumberOfPages();
    doc.setPage(lastPage);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Total Compras: Q ${formatCurrency(totals.totalPurchases)}`, leftX + half, pageHeight - 10, { align: "right" });
    doc.text(`Total Ventas: Q ${formatCurrency(totals.totalSales)}`, rightX + half, pageHeight - 10, { align: "right" });

    previewPdfDoc(doc, `${filenameBase}.pdf`);
    toast({ title: "Exportado", description: "PDF generado correctamente" });
  };

  const exportExcel = () => {
    const comprasHeaderCols = ["Fecha", "Serie", "No. Doc", "NIT", "Proveedor", "Monto"];
    const ventasHeaderCols = ["Fecha", "Serie", "No. Doc", "NIT", "Cliente", "Monto"];
    const totalCols = comprasHeaderCols.length + 1 + ventasHeaderCols.length;

    const aoa: (string | number)[][] = [];
    aoa.push([enterpriseName]);
    aoa.push([`NIT: ${enterpriseNit}    Régimen: ${strategy.label}`]);
    aoa.push([`Libro de Compras y Ventas — ${periodLabel}`]);
    aoa.push([]);
    aoa.push([
      "COMPRAS", ...Array(comprasHeaderCols.length - 1).fill(""),
      "",
      "VENTAS", ...Array(ventasHeaderCols.length - 1).fill(""),
    ]);
    aoa.push([...comprasHeaderCols, "", ...ventasHeaderCols]);

    const activeSales = sales.filter(s => !s.is_annulled);
    const rows = Math.max(purchases.length, activeSales.length);
    const hasAnyData = purchases.length > 0 || activeSales.length > 0;
    if (!hasAnyData) {
      const emptyRow: string[] = Array(totalCols).fill("");
      emptyRow[0] = "SIN MOVIMIENTOS EN EL PERÍODO";
      aoa.push(emptyRow);
    } else {
      for (let i = 0; i < rows; i++) {
        const p = purchases[i];
        const s = activeSales[i];
        aoa.push([
          p ? new Date(p.invoice_date + "T00:00:00").toLocaleDateString("es-GT") : (i === 0 && purchases.length === 0 ? "SIN MOVIMIENTOS" : ""),
          p?.invoice_series ?? "",
          p?.invoice_number ?? "",
          p?.supplier_nit ?? "",
          p?.supplier_name ?? "",
          p ? (Number(p.total_amount) || 0).toFixed(2) : "",
          "",
          s ? new Date(s.invoice_date + "T00:00:00").toLocaleDateString("es-GT") : (i === 0 && activeSales.length === 0 ? "SIN MOVIMIENTOS" : ""),
          s?.invoice_series ?? "",
          s?.invoice_number ?? "",
          s?.customer_nit ?? "",
          s?.customer_name ?? "",
          s ? (Number(s.total_amount) || 0).toFixed(2) : "",
        ]);
      }
    }
    aoa.push([]);
    aoa.push([
      "", "", "", "", "Subtotal:", totals.totalPurchases.toFixed(2),
      "",
      "", "", "", "", "Subtotal:", totals.totalSales.toFixed(2),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 14 },
      { wch: 2 },
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 25 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras y Ventas");
    XLSX.writeFile(wb, `${filenameBase}.xlsx`);
    toast({ title: "Exportado", description: "Excel generado correctamente" });
  };

  const activeSales = sales.filter(s => !s.is_annulled);
  const hasData = purchases.length > 0 || activeSales.length > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 text-sm">
        <strong>{strategy.label}.</strong> Las compras y ventas se presentan en un único libro combinado, conforme al formato SAT.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <Label htmlFor="month">Mes</Label>
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger id="month"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthNames.map((n, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="year">Año</Label>
          <Input id="year" type="number" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} min="2020" max="2099" />
        </div>
        <div className="flex items-end">
          <Button onClick={generateReport} disabled={loading} className="w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Generar Reporte
          </Button>
        </div>
        {reportGenerated && (
          <div className="flex items-end gap-2">
            <Button variant="outline" onClick={exportPDF} className="flex-1">
              <Download className="h-4 w-4 mr-2" />PDF
            </Button>
            <Button variant="outline" onClick={exportExcel} className="flex-1">
              <Download className="h-4 w-4 mr-2" />Excel
            </Button>
          </div>
        )}
      </div>

      {reportGenerated && purchases.length === 0 && activeSales.length === 0 && (
        <div className="rounded-lg border p-16 text-center space-y-4 bg-muted/30">
          <p className="text-xl font-bold text-foreground">SIN MOVIMIENTOS EN EL PERÍODO</p>
          <p className="text-lg font-semibold text-muted-foreground">
            NO HAY COMPRAS NI VENTAS REGISTRADAS EN ESTE PERÍODO
          </p>
          <div className="text-xs text-muted-foreground pt-4 border-t border-border mt-4 space-y-1">
            <p className="font-medium">{enterpriseName}</p>
            <p>NIT: {enterpriseNit || "—"}</p>
            <p>Régimen: {strategy.label}</p>
            <p>Libro de Compras y Ventas — {monthNames[selectedMonth - 1]} {selectedYear}</p>
          </div>
          <p className="text-xs text-muted-foreground italic mt-2">
            El período fue evaluado y no contiene transacciones.
          </p>
        </div>
      )}

      {reportGenerated && (purchases.length > 0 || activeSales.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {purchases.length === 0 ? (
            <div className="rounded-lg border">
              <div className="px-4 py-2 bg-primary/10 font-semibold border-b">Compras</div>
              <div className="p-12 text-center space-y-4 bg-muted/30 flex flex-col items-center justify-center min-h-[300px]">
                <p className="text-lg font-semibold text-muted-foreground">SIN MOVIMIENTOS</p>
                <p className="text-xs text-muted-foreground">No hay compras registradas en este período</p>
              </div>
              <div className="px-4 py-2 bg-muted flex justify-between font-semibold border-t">
                <span>Subtotal Compras (0)</span>
                <span>Q {formatCurrency(0)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="px-4 py-2 bg-primary/10 font-semibold border-b">Compras</div>
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Serie</TableHead>
                      <TableHead>No. Doc</TableHead>
                      <TableHead>NIT</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell>{new Date(p.invoice_date + "T00:00:00").toLocaleDateString("es-GT")}</TableCell>
                        <TableCell>{p.invoice_series}</TableCell>
                        <TableCell>{p.invoice_number}</TableCell>
                        <TableCell>{p.supplier_nit}</TableCell>
                        <TableCell>{p.supplier_name}</TableCell>
                        <TableCell className="text-right">Q {formatCurrency(p.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 py-2 bg-muted flex justify-between font-semibold border-t">
                <span>Subtotal Compras ({totals.purchaseCount})</span>
                <span>Q {formatCurrency(totals.totalPurchases)}</span>
              </div>
            </div>
          )}

          {activeSales.length === 0 ? (
            <div className="rounded-lg border">
              <div className="px-4 py-2 bg-green-500/10 font-semibold border-b">Ventas</div>
              <div className="p-12 text-center space-y-4 bg-muted/30 flex flex-col items-center justify-center min-h-[300px]">
                <p className="text-lg font-semibold text-muted-foreground">SIN MOVIMIENTOS</p>
                <p className="text-xs text-muted-foreground">No hay ventas registradas en este período</p>
              </div>
              <div className="px-4 py-2 bg-muted flex justify-between font-semibold border-t">
                <span>Subtotal Ventas (0)</span>
                <span>Q {formatCurrency(0)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border">
              <div className="px-4 py-2 bg-green-500/10 font-semibold border-b">Ventas</div>
              <div className="max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Serie</TableHead>
                      <TableHead>No. Doc</TableHead>
                      <TableHead>NIT</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeSales.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell>{new Date(s.invoice_date + "T00:00:00").toLocaleDateString("es-GT")}</TableCell>
                        <TableCell>{s.invoice_series}</TableCell>
                        <TableCell>{s.invoice_number}</TableCell>
                        <TableCell>{s.customer_nit || "C/F"}</TableCell>
                        <TableCell>{s.customer_name || "Consumidor Final"}</TableCell>
                        <TableCell className="text-right">Q {formatCurrency(s.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 py-2 bg-muted flex justify-between font-semibold border-t">
                <span>Subtotal Ventas ({totals.saleCount})</span>
                <span>Q {formatCurrency(totals.totalSales)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

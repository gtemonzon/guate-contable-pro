import type jsPDF from "jspdf";

/**
 * jspdf-autotable adjunta `lastAutoTable` al doc en tiempo de ejecución; no
 * está en los tipos de jsPDF. Mismo patrón de cast ya usado en
 * reconciliationExport.ts / QuadraticReconciliationPDF.tsx / quoteExport.ts.
 */
export function getAutoTableFinalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

export interface AssetReportHeaderOptions {
  enterpriseName: string;
  enterpriseNit: string;
  title: string;
}

/**
 * Encabezado "oficial" replicado del Libro de Compras y Ventas
 * (ReporteComprasVentas.tsx): nombre de empresa en negrita, NIT debajo,
 * y el título/período del reporte centrado — para que los 4 reportes de
 * Activos Fijos se vean consistentes con el resto del sistema.
 */
export function drawAssetReportHeader(doc: jsPDF, opts: AssetReportHeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(opts.enterpriseName, margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`NIT: ${opts.enterpriseNit || "—"}`, margin, 17);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(opts.title, pageWidth / 2, 24, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  return 30;
}

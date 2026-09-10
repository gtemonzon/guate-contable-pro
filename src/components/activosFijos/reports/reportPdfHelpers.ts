import type jsPDF from "jspdf";
import type { Styles } from "jspdf-autotable";

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

// Sin relleno de color — mismo criterio económico de impresión que el Libro
// de Compras y Ventas (ReporteComprasVentas.tsx: negrita + línea delgada
// negra en vez de un fondo de color, para abaratar la impresión).
export const noFillTableStyle: Partial<Styles> = {
  fillColor: false,
  textColor: 0,
  fontStyle: "bold",
  lineWidth: 0.2,
  lineColor: [0, 0, 0],
};

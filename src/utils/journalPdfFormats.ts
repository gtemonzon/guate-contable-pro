/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '@/lib/utils';
import type { AuthorizationLegend } from './reportExport';

export interface JournalPdfEntry {
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  total_debit: number;
  total_credit: number;
  details?: Array<{
    account_code: string;
    account_name: string;
    debit_amount: number;
    credit_amount: number;
  }>;
}

export interface JournalPdfOptions {
  filename: string;
  enterpriseName: string;
  dateFrom: string;
  dateTo: string;
  entries: JournalPdfEntry[];
  includeDetails: boolean;
  folioOptions?: { includeFolio: boolean; startingFolio: number };
  authorizationLegend?: AuthorizationLegend;
  format?: JournalPdfFormat;
}

export type JournalPdfFormat = 'legal' | 'audit' | 'management';

type RenderFn = (opts: JournalPdfOptions) => jsPDF;

const formatGtDate = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('es-GT');

/**
 * Legal Printing Format
 * - B&W, minimal ink usage
 * - Prominent journal entry header
 * - No line descriptions
 * - Page numbering only when folios are NOT used
 */
const renderLegal: RenderFn = ({
  enterpriseName,
  dateFrom,
  dateTo,
  entries,
  includeDetails,
  folioOptions,
  authorizationLegend,
}) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const marginX = 14;
  const includeFolio = folioOptions?.includeFolio ?? false;
  const startingFolio = folioOptions?.startingFolio ?? 1;
  const font = 'helvetica';

  const drawHeader = () => {
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(enterpriseName, marginX, 14);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(
      `Libro Diario  ·  Del ${formatGtDate(dateFrom)} al ${formatGtDate(dateTo)}`,
      marginX,
      19,
    );
    // Thin separator
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(marginX, 22, pageWidth - marginX, 22);
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    if (includeFolio) {
      const folio = startingFolio + pageNumber - 1;
      doc.text(`Folio ${folio}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    } else {
      doc.text(
        `Página ${pageNumber} de ${totalPages}`,
        pageWidth - marginX,
        pageHeight - 8,
        { align: 'right' },
      );
    }
    if (authorizationLegend) {
      doc.setFontSize(7);
      doc.text(
        `Autorización: ${authorizationLegend.number} — Fecha: ${authorizationLegend.date}`,
        marginX,
        pageHeight - 8,
      );
    }
  };

  drawHeader();
  let cursorY = 28;

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > pageHeight - 16) {
      doc.addPage();
      drawHeader();
      cursorY = 28;
    }
  };

  entries.forEach((entry, idx) => {
    // Estimate height: header block (~22mm) + details rows (~5mm each) + totals (~10mm)
    const detailRows = includeDetails && entry.details ? entry.details.length : 0;
    const estHeight = 22 + detailRows * 5 + 12;
    ensureSpace(Math.min(estHeight, 60)); // at least leave room for header + a few rows

    // Prominent entry number
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(`PARTIDA #${entry.entry_number}`, marginX, cursorY);
    cursorY += 6;

    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(`Fecha: ${formatGtDate(entry.entry_date)}`, marginX, cursorY);
    doc.text(`Tipo: ${entry.entry_type}`, marginX + 70, cursorY);
    cursorY += 5;

    // Description (wrapped)
    const descLines = doc.splitTextToSize(
      `Concepto: ${entry.description || ''}`,
      pageWidth - marginX * 2,
    );
    doc.text(descLines, marginX, cursorY);
    cursorY += descLines.length * 4.2 + 2;

    if (includeDetails && entry.details && entry.details.length > 0) {
      autoTable(doc, {
        startY: cursorY,
        margin: { left: marginX, right: marginX, bottom: 16 },
        head: [['Código', 'Cuenta', 'Debe', 'Haber']],
        body: entry.details.map((d) => [
          d.account_code,
          d.account_name,
          d.debit_amount > 0 ? formatCurrency(d.debit_amount) : '',
          d.credit_amount > 0 ? formatCurrency(d.credit_amount) : '',
        ]),
        theme: 'plain',
        styles: {
          font,
          fontSize: 9,
          textColor: [0, 0, 0],
          cellPadding: 1.2,
          lineColor: [120, 120, 120],
          lineWidth: 0.1,
        },
        headStyles: {
          fontStyle: 'bold',
          fillColor: false as any,
          textColor: [0, 0, 0],
          lineWidth: { top: 0.2, bottom: 0.2, left: 0, right: 0 },
          lineColor: [0, 0, 0],
        },
        columnStyles: {
          0: { cellWidth: 28 },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 30, halign: 'right' },
          3: { cellWidth: 30, halign: 'right' },
        },
        didDrawPage: () => {
          drawHeader();
        },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 2;
    }

    // Totals
    ensureSpace(12);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 4;
    doc.setFont(font, 'bold');
    doc.setFontSize(9);
    const totalsRightX = pageWidth - marginX;
    doc.text(
      `TOTAL DEBE:  ${formatCurrency(entry.total_debit)}`,
      totalsRightX - 60,
      cursorY,
    );
    doc.text(
      `TOTAL HABER:  ${formatCurrency(entry.total_credit)}`,
      totalsRightX,
      cursorY,
      { align: 'right' },
    );
    cursorY += 4;
    doc.setLineWidth(0.4);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 8;

    if (idx < entries.length - 1) {
      ensureSpace(20);
    }
  });

  // Grand totals
  const grandDebit = entries.reduce((s, e) => s + e.total_debit, 0);
  const grandCredit = entries.reduce((s, e) => s + e.total_credit, 0);
  ensureSpace(20);
  doc.setFont(font, 'bold');
  doc.setFontSize(10);
  doc.text('RESUMEN GENERAL', marginX, cursorY);
  cursorY += 5;
  doc.setFontSize(9);
  doc.text(`Cantidad de partidas: ${entries.length}`, marginX, cursorY);
  cursorY += 4;
  doc.text(`Total Debe:  ${formatCurrency(grandDebit)}`, marginX, cursorY);
  cursorY += 4;
  doc.text(`Total Haber: ${formatCurrency(grandCredit)}`, marginX, cursorY);

  // Footer with page numbers (rendered after total pages known)
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(p, totalPages);
  }

  return doc;
};

// Registry for future formats
const FORMAT_RENDERERS: Record<JournalPdfFormat, RenderFn> = {
  legal: renderLegal,
  // audit: renderAudit, // future
  // management: renderManagement, // future
  audit: renderLegal,
  management: renderLegal,
};

export const buildJournalPdf = (opts: JournalPdfOptions): jsPDF => {
  const render = FORMAT_RENDERERS[opts.format ?? 'legal'] ?? renderLegal;
  return render(opts);
};

export const exportJournalEntriesToPDF = (
  opts: JournalPdfOptions,
): { pageCount: number } => {
  const doc = buildJournalPdf(opts);
  const pageCount = doc.getNumberOfPages();
  doc.save(`${opts.filename}.pdf`);
  return { pageCount };
};

export const estimateJournalPdfPageCount = (opts: JournalPdfOptions): number => {
  const doc = buildJournalPdf(opts);
  return doc.getNumberOfPages();
};

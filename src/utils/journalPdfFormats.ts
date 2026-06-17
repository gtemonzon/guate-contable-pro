/* eslint-disable @typescript-eslint/no-explicit-any */
import jsPDF from 'jspdf';
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
 * Legal Printing Format — manual row-by-row layout for full control over
 * smart page breaks, "(continúa)" headers, repeated column headers, and
 * keeping totals together with the last lines of a journal entry.
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
  const topY = 28;
  const bottomLimit = pageHeight - 16;
  const includeFolio = folioOptions?.includeFolio ?? false;
  const startingFolio = folioOptions?.startingFolio ?? 1;
  const font = 'helvetica';

  // Column layout (mm)
  const COL_CODE_W = 28;
  const COL_DEBIT_W = 30;
  const COL_CREDIT_W = 30;
  const COL_NAME_X = marginX + COL_CODE_W;
  const COL_NAME_W = pageWidth - marginX * 2 - COL_CODE_W - COL_DEBIT_W - COL_CREDIT_W;
  const COL_DEBIT_X = COL_NAME_X + COL_NAME_W;
  const COL_CREDIT_X = COL_DEBIT_X + COL_DEBIT_W;

  const ROW_H = 5;
  const HEADER_ROW_H = 5.5;
  const TOTALS_BLOCK_H = 12;

  let cursorY = topY;
  let currentContinuation: { entryNumber: string } | null = null;

  const drawPageHeader = () => {
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
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(marginX, 22, pageWidth - marginX, 22);
  };

  const drawColumnHeaders = (y: number): number => {
    doc.setFont(font, 'bold');
    doc.setFontSize(9);
    doc.text('Código', marginX, y);
    doc.text('Cuenta', COL_NAME_X, y);
    doc.text('Debe', COL_DEBIT_X + COL_DEBIT_W, y, { align: 'right' });
    doc.text('Haber', COL_CREDIT_X + COL_CREDIT_W, y, { align: 'right' });
    doc.setLineWidth(0.2);
    doc.line(marginX, y + 1.2, pageWidth - marginX, y + 1.2);
    doc.setFont(font, 'normal');
    return y + HEADER_ROW_H;
  };

  const newPage = () => {
    doc.addPage();
    drawPageHeader();
    cursorY = topY;
    if (currentContinuation) {
      doc.setFont(font, 'bold');
      doc.setFontSize(10);
      doc.text(
        `PARTIDA #${currentContinuation.entryNumber} (continúa)`,
        marginX,
        cursorY,
      );
      cursorY += 6;
      cursorY = drawColumnHeaders(cursorY);
    }
  };

  const ensureSpace = (needed: number) => {
    if (cursorY + needed > bottomLimit) newPage();
  };

  drawPageHeader();

  entries.forEach((entry) => {
    currentContinuation = null;

    const descLines = doc.splitTextToSize(
      `Concepto: ${entry.description || ''}`,
      pageWidth - marginX * 2,
    );
    const headerBlockH = 6 + 5 + descLines.length * 4.2 + 2 + HEADER_ROW_H;

    // Reserve enough room for header + at least 2 rows + totals
    const minStartH = headerBlockH + ROW_H * 2 + TOTALS_BLOCK_H;
    ensureSpace(Math.min(minStartH, bottomLimit - topY));

    // PARTIDA header
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(`PARTIDA #${entry.entry_number}`, marginX, cursorY);
    cursorY += 6;

    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(`Fecha: ${formatGtDate(entry.entry_date)}`, marginX, cursorY);
    doc.text(`Tipo: ${entry.entry_type}`, marginX + 70, cursorY);
    cursorY += 5;

    doc.text(descLines, marginX, cursorY);
    cursorY += descLines.length * 4.2 + 2;

    const details = includeDetails ? entry.details ?? [] : [];

    if (details.length > 0) {
      cursorY = drawColumnHeaders(cursorY);
      currentContinuation = { entryNumber: entry.entry_number };

      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        const remaining = details.length - i;
        const isLastFew = remaining <= 3;
        // Keep last few rows together with totals
        const needed = isLastFew ? ROW_H * remaining + TOTALS_BLOCK_H : ROW_H;

        if (cursorY + needed > bottomLimit) {
          newPage();
        }

        const nameLines = doc.splitTextToSize(d.account_name, COL_NAME_W - 2);
        const rowH = Math.max(ROW_H, nameLines.length * 4.2 + 1);
        doc.setFont(font, 'normal');
        doc.setFontSize(9);
        doc.text(d.account_code, marginX, cursorY);
        doc.text(nameLines, COL_NAME_X, cursorY);
        if (d.debit_amount > 0) {
          doc.text(
            formatCurrency(d.debit_amount),
            COL_DEBIT_X + COL_DEBIT_W,
            cursorY,
            { align: 'right' },
          );
        }
        if (d.credit_amount > 0) {
          doc.text(
            formatCurrency(d.credit_amount),
            COL_CREDIT_X + COL_CREDIT_W,
            cursorY,
            { align: 'right' },
          );
        }
        cursorY += rowH;
      }
    }

    // Totals — guaranteed to fit with last few rows by logic above
    ensureSpace(TOTALS_BLOCK_H);
    doc.setDrawColor(0);
    doc.setLineWidth(0.2);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 4;
    doc.setFont(font, 'bold');
    doc.setFontSize(9);
    doc.text(
      `TOTAL DEBE:  ${formatCurrency(entry.total_debit)}`,
      COL_DEBIT_X + COL_DEBIT_W,
      cursorY,
      { align: 'right' },
    );
    doc.text(
      `TOTAL HABER:  ${formatCurrency(entry.total_credit)}`,
      COL_CREDIT_X + COL_CREDIT_W,
      cursorY,
      { align: 'right' },
    );
    cursorY += 3;
    doc.setLineWidth(0.4);
    doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 8;

    currentContinuation = null;
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

  // Footers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    if (includeFolio) {
      const folio = startingFolio + p - 1;
      doc.text(`Folio ${folio}`, pageWidth - marginX, pageHeight - 8, {
        align: 'right',
      });
    } else {
      doc.text(
        `Página ${p} de ${totalPages}`,
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
  }

  return doc;
};

// Registry for future formats (audit/management currently alias to legal)
const FORMAT_RENDERERS: Record<JournalPdfFormat, RenderFn> = {
  legal: renderLegal,
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

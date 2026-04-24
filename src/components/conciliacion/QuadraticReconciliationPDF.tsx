import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ADJUSTMENT_TYPE_LABELS, type AdjustmentRecord } from '@/hooks/useBankReconciliationQuadratic';

interface PDFInput {
  enterpriseName: string;
  enterpriseNit: string;
  bankName: string;
  accountNumber: string;
  reconciliationDate: string;
  data: {
    initial_balance_bank: number; initial_balance_books: number;
    final_balance_bank: number; final_balance_books: number;
    total_income_bank: number; total_income_books: number;
    total_expenses_bank: number; total_expenses_books: number;
    auditor_name: string; auditor_colegiado_number: string; auditor_signature_date: string;
  };
  adjustments: AdjustmentRecord[];
  reconciledBank: number;
  reconciledBooks: number;
}

const fmt = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generateQuadraticPDF(input: PDFInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('CONCILIACIÓN BANCARIA CUADRÁTICA', pageWidth / 2, y, { align: 'center' });
  y += 18;
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(input.enterpriseName, pageWidth / 2, y, { align: 'center' });
  y += 12;
  doc.text(`NIT: ${input.enterpriseNit}`, pageWidth / 2, y, { align: 'center' });
  y += 18;

  doc.setFontSize(9);
  doc.text(`Banco: ${input.bankName}`, 40, y);
  doc.text(`Cuenta: ${input.accountNumber}`, 300, y);
  doc.text(`Fecha: ${input.reconciliationDate}`, 480, y);
  y += 20;

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Banco (Q)', 'Libros (Q)']],
    body: [
      ['Saldo Inicial', fmt(input.data.initial_balance_bank), fmt(input.data.initial_balance_books)],
      ['(+) Ingresos del período', fmt(input.data.total_income_bank), fmt(input.data.total_income_books)],
      ['(-) Egresos del período', fmt(input.data.total_expenses_bank), fmt(input.data.total_expenses_books)],
      ['Saldo Final', fmt(input.data.final_balance_bank), fmt(input.data.final_balance_books)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  if (input.adjustments.length > 0) {
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Partidas Conciliatorias', 40, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['Tipo', 'Afecta', 'Descripción', 'Referencia', 'Monto (Q)']],
      body: input.adjustments.map((a) => [
        ADJUSTMENT_TYPE_LABELS[a.adjustment_type],
        a.affects_side === 'banco' ? 'Banco' : 'Libros',
        a.description,
        a.document_reference || '—',
        fmt(a.amount),
      ]),
      theme: 'striped',
      columnStyles: { 4: { halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text(`Saldo conciliado banco: Q ${fmt(input.reconciledBank)}`, 40, y);
  doc.text(`Saldo conciliado libros: Q ${fmt(input.reconciledBooks)}`, 320, y);
  y += 14;
  const diff = Math.abs(input.reconciledBank - input.reconciledBooks);
  doc.setTextColor(diff < 0.01 ? 0 : 200, diff < 0.01 ? 128 : 0, 0);
  doc.text(`Diferencia: Q ${fmt(diff)} ${diff < 0.01 ? '(CUADRA)' : '(REVISAR)'}`, 40, y);
  doc.setTextColor(0, 0, 0);
  y += 50;

  doc.line(40, y, 250, y);
  doc.line(320, y, 540, y);
  y += 12;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(input.data.auditor_name || 'Contador Público y Auditor', 145, y, { align: 'center' });
  doc.text('Representante Legal', 430, y, { align: 'center' });
  y += 11;
  if (input.data.auditor_colegiado_number) {
    doc.text(`Colegiado No. ${input.data.auditor_colegiado_number}`, 145, y, { align: 'center' });
  }
  if (input.data.auditor_signature_date) {
    y += 11;
    doc.text(`Fecha: ${input.data.auditor_signature_date}`, 145, y, { align: 'center' });
  }

  doc.save(`conciliacion-cuadratica-${input.reconciliationDate}.pdf`);
}

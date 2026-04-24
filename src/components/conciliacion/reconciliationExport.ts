import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export interface ReconciliationExportMovement {
  movement_date: string;
  description: string;
  bank_reference: string | null;
  beneficiary_name: string | null;
  debit_amount: number;
  credit_amount: number;
}

export interface ReconciliationExportInput {
  enterpriseName: string;
  enterpriseNit: string;
  bankName: string;
  accountNumber: string;
  reconciliationDate: string;
  period: string; // e.g. "Enero 2025"
  bankStatementBalance: number;
  bookBalance: number;
  difference: number;
  notes?: string;
  reconciledMovements: ReconciliationExportMovement[];
  pendingMovements: ReconciliationExportMovement[];
}

const fmt = (n: number) =>
  n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const movRow = (m: ReconciliationExportMovement) => [
  m.movement_date,
  m.bank_reference || '—',
  m.beneficiary_name || '—',
  m.description,
  m.debit_amount > 0 ? `Q ${fmt(m.debit_amount)}` : '',
  m.credit_amount > 0 ? `Q ${fmt(m.credit_amount)}` : '',
];

export function exportReconciliationPDF(input: ReconciliationExportInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('CONCILIACIÓN BANCARIA', pageWidth / 2, y, { align: 'center' });
  y += 16;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(input.enterpriseName, pageWidth / 2, y, { align: 'center' });
  y += 12;
  doc.text(`NIT: ${input.enterpriseNit}`, pageWidth / 2, y, { align: 'center' });
  y += 18;

  doc.setFontSize(9);
  doc.text(`Banco: ${input.bankName}`, 40, y);
  doc.text(`Cuenta: ${input.accountNumber}`, 280, y);
  doc.text(`Fecha: ${input.reconciliationDate}`, 470, y);
  y += 14;
  doc.text(`Período conciliado: ${input.period}`, 40, y);
  y += 16;

  const pendingDebits = input.pendingMovements.reduce((s, m) => s + (m.debit_amount || 0), 0);
  const pendingCredits = input.pendingMovements.reduce((s, m) => s + (m.credit_amount || 0), 0);
  const pendingNet = pendingDebits - pendingCredits;
  const realDifference = input.bookBalance - input.bankStatementBalance;

  autoTable(doc, {
    startY: y,
    head: [['Concepto', 'Monto (Q)']],
    body: [
      ['Saldo según libros', fmt(input.bookBalance)],
      ['Saldo según estado de cuenta bancario', fmt(input.bankStatementBalance)],
      ['Diferencia (Libros - Banco)', fmt(realDifference)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: { 1: { halign: 'right' } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;

  if (y > doc.internal.pageSize.getHeight() - 120) {
    doc.addPage();
    y = 40;
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Movimientos pendientes / no conciliados (${input.pendingMovements.length})`, 40, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Cheques en circulación y/o depósitos pendientes de reflejar en el banco.', 40, y + 8);
  y += 12;

  if (input.pendingMovements.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Ref.', 'Beneficiario', 'Descripción', 'Débito', 'Crédito']],
      body: input.pendingMovements.map(movRow),
      foot: [[
        '', '', '', 'Totales',
        pendingDebits > 0 ? `Q ${fmt(pendingDebits)}` : '',
        pendingCredits > 0 ? `Q ${fmt(pendingCredits)}` : '',
      ]],
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [40, 40, 40] },
      footStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const netLabel = pendingNet >= 0
      ? `Neto pendiente (Débitos - Créditos): Q ${fmt(pendingNet)}`
      : `Neto pendiente (Débitos - Créditos): (Q ${fmt(Math.abs(pendingNet))})`;
    doc.text(netLabel, 40, y);
    y += 12;

    const cuadra = Math.abs(realDifference - pendingNet) < 0.01;
    doc.setTextColor(cuadra ? 0 : 200, cuadra ? 128 : 0, 0);
    doc.text(
      `Diferencia vs. movimientos pendientes: Q ${fmt(Math.abs(realDifference - pendingNet))} ${cuadra ? '(CUADRA)' : '(REVISAR)'}`,
      40,
      y,
    );
    doc.setTextColor(0, 0, 0);
    y += 16;
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('No existen movimientos pendientes en el período.', 40, y);
    y += 16;
  }

  if (input.notes) {
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = 40;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Observaciones:', 40, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(input.notes, pageWidth - 80);
    doc.text(lines, 40, y);
    y += lines.length * 11 + 20;
  }

  if (y > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage();
    y = doc.internal.pageSize.getHeight() - 100;
  } else {
    y = Math.max(y, doc.internal.pageSize.getHeight() - 100);
  }
  doc.line(80, y, 280, y);
  doc.line(340, y, 540, y);
  y += 12;
  doc.setFontSize(9);
  doc.text('Elaborado por', 180, y, { align: 'center' });
  doc.text('Revisado por', 440, y, { align: 'center' });

  doc.save(`conciliacion-${input.bankName}-${input.reconciliationDate}.pdf`);
}

export function exportReconciliationExcel(input: ReconciliationExportInput) {
  const wb = XLSX.utils.book_new();

  const summary: (string | number)[][] = [
    ['CONCILIACIÓN BANCARIA'],
    [input.enterpriseName],
    [`NIT: ${input.enterpriseNit}`],
    [],
    ['Banco', input.bankName],
    ['Cuenta', input.accountNumber],
    ['Fecha de conciliación', input.reconciliationDate],
    ['Período conciliado', input.period],
    [],
    ['Saldo según estado de cuenta bancario', input.bankStatementBalance],
    ['Saldo según libros (conciliados)', input.bookBalance],
    ['Diferencia', input.difference],
    [],
    ['Movimientos conciliados', input.reconciledMovements.length],
    ['Movimientos pendientes', input.pendingMovements.length],
  ];
  if (input.notes) {
    summary.push([], ['Observaciones'], [input.notes]);
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary['!cols'] = [{ wch: 40 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  const headers = ['Fecha', 'Referencia', 'Beneficiario', 'Descripción', 'Débito', 'Crédito'];
  const buildSheet = (movs: ReconciliationExportMovement[]) => {
    const rows = [
      headers,
      ...movs.map((m) => [
        m.movement_date,
        m.bank_reference || '',
        m.beneficiary_name || '',
        m.description,
        m.debit_amount || 0,
        m.credit_amount || 0,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 28 }, { wch: 40 }, { wch: 14 }, { wch: 14 }];
    return ws;
  };

  XLSX.utils.book_append_sheet(wb, buildSheet(input.reconciledMovements), 'Conciliados');
  XLSX.utils.book_append_sheet(wb, buildSheet(input.pendingMovements), 'Pendientes');

  XLSX.writeFile(wb, `conciliacion-${input.bankName}-${input.reconciliationDate}.xlsx`);
}

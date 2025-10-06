import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ExportOptions {
  filename: string;
  title: string;
  enterpriseName: string;
  headers: string[];
  data: any[][];
  totals?: { label: string; value: string }[];
}

export const exportToExcel = ({ filename, title, enterpriseName, headers, data, totals }: ExportOptions) => {
  const wb = XLSX.utils.book_new();
  
  // Crear hoja de datos
  const wsData = [
    [enterpriseName],
    [title],
    [],
    headers,
    ...data,
  ];

  // Agregar totales si existen
  if (totals && totals.length > 0) {
    wsData.push([]);
    totals.forEach(total => {
      wsData.push([total.label, total.value]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Ajustar ancho de columnas
  const colWidths = headers.map((_, idx) => {
    const maxLength = Math.max(
      headers[idx]?.length || 10,
      ...data.map(row => String(row[idx] || '').length)
    );
    return { wch: Math.min(maxLength + 2, 50) };
  });
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

export const exportToPDF = ({ filename, title, enterpriseName, headers, data, totals }: ExportOptions) => {
  const doc = new jsPDF({
    orientation: headers.length > 5 ? 'landscape' : 'portrait',
  });

  // Encabezado
  doc.setFontSize(16);
  doc.text(enterpriseName, 14, 15);
  doc.setFontSize(12);
  doc.text(title, 14, 22);

  // Tabla
  autoTable(doc, {
    startY: 30,
    head: [headers],
    body: data,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
  });

  // Totales
  if (totals && totals.length > 0) {
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    totals.forEach((total, idx) => {
      doc.text(`${total.label}: ${total.value}`, 14, finalY + (idx * 7));
    });
  }

  doc.save(`${filename}.pdf`);
};

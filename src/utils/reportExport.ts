import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FolioOptions {
  includeFolio: boolean;
  startingFolio: number;
}

interface ExportOptions {
  filename: string;
  title: string;
  enterpriseName: string;
  headers: string[];
  data: any[][];
  totals?: { label: string; value: string }[];
  statistics?: { label: string; items: { name: string; value: string; count: number }[] }[];
  folioOptions?: FolioOptions;
}

export const exportToExcel = ({ filename, title, enterpriseName, headers, data, totals, statistics }: ExportOptions) => {
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
    wsData.push(['RESUMEN DE TOTALES']);
    totals.forEach(total => {
      wsData.push([total.label, total.value]);
    });
  }

  // Agregar estadísticas si existen
  if (statistics && statistics.length > 0) {
    wsData.push([]);
    wsData.push(['ESTADÍSTICAS']);
    statistics.forEach(stat => {
      wsData.push([]);
      wsData.push([stat.label]);
      stat.items.forEach(item => {
        wsData.push([`  ${item.name}`, item.value, `(${item.count} documentos)`]);
      });
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

export const exportToPDF = ({ filename, title, enterpriseName, headers, data, totals, statistics, folioOptions }: ExportOptions) => {
  const doc = new jsPDF({
    orientation: headers.length > 5 ? 'landscape' : 'portrait',
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const includeFolio = folioOptions?.includeFolio ?? false;
  const startingFolio = folioOptions?.startingFolio ?? 1;

  // Function to add folio to a page
  const addFolioToPage = (pageNumber: number) => {
    if (includeFolio) {
      const folioNumber = startingFolio + pageNumber - 1;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      // Add folio in top right corner
      doc.text(`Folio: ${folioNumber}`, pageWidth - 14, 10, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    }
  };

  // Encabezado
  doc.setFontSize(16);
  doc.text(enterpriseName, 14, 15);
  doc.setFontSize(12);
  doc.text(title, 14, 22);
  
  // Add folio to first page
  addFolioToPage(1);

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
    didDrawPage: (data) => {
      // Add folio to each new page (except first which we already did)
      if (data.pageNumber > 1) {
        addFolioToPage(data.pageNumber);
      }
    },
  });

  let currentY = (doc as any).lastAutoTable.finalY + 10;
  let currentPage = doc.getNumberOfPages();

  // Totales
  if (totals && totals.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN DE TOTALES', 14, currentY);
    currentY += 6;
    doc.setFont('helvetica', 'normal');
    totals.forEach((total) => {
      doc.text(`${total.label}: ${total.value}`, 14, currentY);
      currentY += 5;
    });
    currentY += 5;
  }

  // Estadísticas
  if (statistics && statistics.length > 0) {
    statistics.forEach((stat) => {
      // Verificar si necesitamos nueva página
      if (currentY > pageHeight - 40) {
        doc.addPage();
        currentPage++;
        addFolioToPage(currentPage);
        currentY = 20;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(stat.label, 14, currentY);
      currentY += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      
      stat.items.forEach((item) => {
        doc.text(`${item.name}: ${item.value} (${item.count} docs)`, 20, currentY);
        currentY += 5;
      });
      currentY += 3;
    });
  }

  doc.save(`${filename}.pdf`);
};

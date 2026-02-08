import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FolioOptions {
  includeFolio: boolean;
  startingFolio: number;
}

interface PdfTypographyOptions {
  fontFamily?: "helvetica" | "courier" | "times";
  fontSize?: number;
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
  pdfTypography?: PdfTypographyOptions;
  forcePortrait?: boolean;
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

interface PdfOrientationOptions {
  forcePortrait?: boolean;
}

export const exportToPDF = ({ filename, title, enterpriseName, headers, data, totals, statistics, folioOptions, pdfTypography, forcePortrait }: ExportOptions) => {
  const doc = new jsPDF({
    orientation: forcePortrait ? 'portrait' : (headers.length > 5 ? 'landscape' : 'portrait'),
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const includeFolio = folioOptions?.includeFolio ?? false;
  const startingFolio = folioOptions?.startingFolio ?? 1;
  
  // Typography configuration
  const fontFamily = pdfTypography?.fontFamily ?? 'helvetica';
  const baseFontSize = pdfTypography?.fontSize ?? 8;
  const headerFontSize = baseFontSize + 2;
  const titleFontSize = baseFontSize + 8;
  const subtitleFontSize = baseFontSize + 4;

  // Function to add folio to a page
  const addFolioToPage = (pageNumber: number) => {
    if (includeFolio) {
      const folioNumber = startingFolio + pageNumber - 1;
      doc.setFontSize(baseFontSize + 2);
      doc.setFont(fontFamily, 'bold');
      // Add folio in top right corner
      doc.text(`Folio: ${folioNumber}`, pageWidth - 14, 10, { align: 'right' });
      doc.setFont(fontFamily, 'normal');
    }
  };

  // Encabezado
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(titleFontSize);
  doc.text(enterpriseName, 14, 15);
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(subtitleFontSize);
  doc.text(title, 14, 22);
  
  // Add folio to first page
  addFolioToPage(1);

  // Tabla
  autoTable(doc, {
    startY: 30,
    head: [headers],
    body: data,
    styles: {
      font: fontFamily,
      fontSize: baseFontSize,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: headerFontSize,
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

  // Calculate if we have statistics to show side by side
  const hasStatistics = statistics && statistics.length > 0;
  
  // Totales y Estadísticas lado a lado
  if ((totals && totals.length > 0) || hasStatistics) {
    // Check if we need a new page
    const requiredHeight = Math.max(
      totals ? (totals.length * 5 + 15) : 0,
      hasStatistics ? (statistics!.reduce((sum, s) => sum + s.items.length * 5 + 10, 0) + 10) : 0
    );
    
    if (currentY + requiredHeight > pageHeight - 20) {
      doc.addPage();
      currentPage++;
      addFolioToPage(currentPage);
      currentY = 20;
    }

    const leftColumnX = 14;
    const rightColumnX = pageWidth / 2 + 10;
    let leftY = currentY;
    let rightY = currentY;

    // Totales en la columna izquierda
    if (totals && totals.length > 0) {
      doc.setFontSize(baseFontSize + 2);
      doc.setFont(fontFamily, 'bold');
      doc.text('RESUMEN DE TOTALES', leftColumnX, leftY);
      leftY += 6;
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(baseFontSize);
      totals.forEach((total) => {
        doc.text(`${total.label}: ${total.value}`, leftColumnX, leftY);
        leftY += 5;
      });
    }

    // Estadísticas en la columna derecha
    if (hasStatistics) {
      statistics!.forEach((stat) => {
        doc.setFontSize(baseFontSize + 2);
        doc.setFont(fontFamily, 'bold');
        doc.text(stat.label, rightColumnX, rightY);
        rightY += 6;
        doc.setFont(fontFamily, 'normal');
        doc.setFontSize(baseFontSize + 1);
        
        stat.items.forEach((item) => {
          doc.text(`${item.name}: ${item.value} (${item.count} docs)`, rightColumnX + 4, rightY);
          rightY += 5;
        });
        rightY += 3;
      });
    }

    currentY = Math.max(leftY, rightY) + 5;
  }

  doc.save(`${filename}.pdf`);
};

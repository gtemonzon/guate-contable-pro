/* eslint-disable @typescript-eslint/no-explicit-any */
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

export interface AuthorizationLegend {
  number: string;
  date: string;
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
  boldRows?: number[];
  authorizationLegend?: AuthorizationLegend;
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

const buildPdfDocument = ({ title, enterpriseName, headers, data, totals, statistics, folioOptions, pdfTypography, forcePortrait, boldRows, authorizationLegend }: Omit<ExportOptions, 'filename'>): jsPDF => {
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

  // Function to add folio + authorization legend to a page
  const addPageDecorations = (pageNumber: number) => {
    if (includeFolio) {
      const folioNumber = startingFolio + pageNumber - 1;
      doc.setFontSize(baseFontSize + 2);
      doc.setFont(fontFamily, 'bold');
      doc.text(`Folio: ${folioNumber}`, pageWidth - 14, 10, { align: 'right' });
      doc.setFont(fontFamily, 'normal');
    }
    if (authorizationLegend) {
      doc.setFontSize(Math.max(baseFontSize - 1, 6));
      doc.setFont(fontFamily, 'normal');
      const legend = `Autorización: ${authorizationLegend.number} — Fecha: ${authorizationLegend.date}`;
      doc.text(legend, 14, pageHeight - 6);
    }
  };

  // Encabezado
  doc.setFont(fontFamily, 'bold');
  doc.setFontSize(titleFontSize);
  doc.text(enterpriseName, 14, 15);
  doc.setFont(fontFamily, 'normal');
  doc.setFontSize(subtitleFontSize);
  doc.text(title, 14, 22);
  
  addPageDecorations(1);

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
    margin: { bottom: authorizationLegend ? 14 : 10 },
    didParseCell: (cellData) => {
      if (boldRows && boldRows.includes(cellData.row.index)) {
        cellData.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        addPageDecorations(data.pageNumber);
      }
    },
  });

  let currentY = (doc as any).lastAutoTable.finalY + 10;
  let currentPage = doc.getNumberOfPages();

  const hasStatistics = statistics && statistics.length > 0;
  
  if ((totals && totals.length > 0) || hasStatistics) {
    const requiredHeight = Math.max(
      totals ? (totals.length * 5 + 15) : 0,
      hasStatistics ? (statistics!.reduce((sum, s) => sum + s.items.length * 5 + 10, 0) + 10) : 0
    );
    
    if (currentY + requiredHeight > pageHeight - 20) {
      doc.addPage();
      currentPage++;
      addPageDecorations(currentPage);
      currentY = 20;
    }

    const leftColumnX = 14;
    const rightColumnX = pageWidth / 2 + 10;
    let leftY = currentY;
    let rightY = currentY;

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

  const pageCount = doc.getNumberOfPages();
  doc.save(`${filename}.pdf`);
  return { pageCount };
};

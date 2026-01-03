import { Button } from "@/components/ui/button";
import { FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import type { PurchaseRecord, SaleRecord } from "@/hooks/useDeclaracionCalculo";

interface ExportAnexoButtonProps {
  type: 'compras' | 'ventas';
  data: PurchaseRecord[] | SaleRecord[];
  month: number;
  year: number;
  enterpriseName: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function ExportAnexoButton({ type, data, month, year, enterpriseName }: ExportAnexoButtonProps) {
  const handleExport = () => {
    let worksheetData: Record<string, any>[];
    let filename: string;

    if (type === 'compras') {
      const purchases = data as PurchaseRecord[];
      worksheetData = purchases.map((p, idx) => ({
        'No.': idx + 1,
        'Tipo Identificación': 'NIT',
        'Número Identificación': p.supplier_nit,
        'Nombre Proveedor': p.supplier_name,
        'Fecha Factura': p.invoice_date,
        'Serie': p.invoice_series || '',
        'Número Documento': p.invoice_number,
        'Monto Neto': p.net_amount,
        'IVA': p.vat_amount,
        'Total Facturado': p.total_amount,
      }));
      filename = `Anexo_Compras_${MONTHS[month - 1]}_${year}.xlsx`;
    } else {
      const sales = data as SaleRecord[];
      worksheetData = sales.map((s, idx) => ({
        'No.': idx + 1,
        'Fecha Factura': s.invoice_date,
        'Tipo Documento': s.fel_document_type,
        'Monto Neto': s.net_amount,
        'IVA': s.vat_amount,
        'Total': s.total_amount,
      }));
      filename = `Anexo_Ventas_${MONTHS[month - 1]}_${year}.xlsx`;
    }

    // Add header row with enterprise info
    const ws = XLSX.utils.json_to_sheet(worksheetData);
    
    // Auto-size columns
    const colWidths = Object.keys(worksheetData[0] || {}).map(key => ({
      wch: Math.max(key.length, 15)
    }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type === 'compras' ? 'Compras' : 'Ventas');
    XLSX.writeFile(wb, filename);
  };

  const isEmpty = !data || data.length === 0;

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={isEmpty}
      className="gap-2"
    >
      <FileSpreadsheet className="h-4 w-4" />
      Exportar Anexo {type === 'compras' ? 'Compras' : 'Ventas'}
    </Button>
  );
}

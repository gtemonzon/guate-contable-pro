import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFileDrop } from "@/hooks/use-file-drop";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSafeErrorMessage, sanitizeCSVField } from "@/utils/errorMessages";
import {
  normalizeHeader,
  SAT_SALES_MAPPING,
  findSATColumnIndex,
  parseDateFlexible,
  parseNumber,
  isSATFormat,
  isAnulado,
} from "@/utils/satImportMapping";

interface ImportSalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number | null;
  onSuccess: () => void;
}

// Helper to find accounting period for a given date
async function findAccountingPeriod(
  enterpriseId: number,
  invoiceDate: string
): Promise<{ id: number } | null> {
  const { data: period, error } = await supabase
    .from("tab_accounting_periods")
    .select("id")
    .eq("enterprise_id", enterpriseId)
    .lte("start_date", invoiceDate)
    .gte("end_date", invoiceDate)
    .eq("status", "abierto")
    .maybeSingle();

  if (error) throw error;
  return period;
}

// Parse file (CSV or Excel) and return rows as 2D array
async function parseFile(file: File): Promise<any[][]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  
  if (extension === "xls" || extension === "xlsx") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false }) as any[][];
    return data.filter(row => row.some(cell => cell !== undefined && cell !== null && cell !== ""));
  } else {
    const text = await file.text();
    const lines = text.split("\n").filter(line => line.trim());
    return lines.map(line => parseCSVLine(line));
  }
}

// Helper to parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

export function ImportSalesDialog({
  open,
  onOpenChange,
  enterpriseId,
  onSuccess,
}: ImportSalesDialogProps) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);

  const { isDragging, dragProps } = useFileDrop({
    accept: [".csv", ".xls", ".xlsx", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    onFile: (file) => handleImport(file),
    onError: (message) => toast({ variant: "destructive", title: "Error", description: message }),
    disabled: importing,
  });

  const downloadTemplate = () => {
    const headers = [
      "Fecha de emisión",
      "Número de Autorización",
      "Tipo de DTE",
      "Serie",
      "Número del DTE",
      "ID del receptor",
      "Nombre completo del receptor",
      "Gran Total (Moneda Original)",
      "IVA (monto de este impuesto)",
      "Marca de anulado"
    ];

    const csvContent = headers.join(",") + "\n" +
      "15/01/2025,ABC123456789,FACT,A,12345,12345678,Cliente Ejemplo S.A.,112.00,12.00,No\n" +
      "20/02/2025,DEF987654321,FACT,B,67890,87654321,Otro Cliente S.A.,224.00,24.00,No";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_ventas_sat.csv";
    link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
  };

  const handleImport = async (file: File) => {
    if (!enterpriseId) return;

    setImporting(true);

    try {
      const rows = await parseFile(file);
      
      if (rows.length < 2) {
        throw new Error("El archivo está vacío o no tiene datos");
      }

      // Parse headers
      const rawHeaders = rows[0].map(h => String(h || "").trim());
      const normalizedHeaders = rawHeaders.map(normalizeHeader);
      
      // Detect if SAT format
      const useSATFormat = isSATFormat(rawHeaders);
      
      // Get column indices based on format
      let colIndices: Record<string, number>;
      
      if (useSATFormat) {
        colIndices = {
          fecha: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.fecha),
          serie: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.serie),
          numero: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.numero),
          tipo_documento: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.tipo_documento),
          numero_autorizacion: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.numero_autorizacion),
          nit: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.nit),
          nombre: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.nombre),
          total: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.total),
          iva: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.iva),
          anulado: findSATColumnIndex(normalizedHeaders, SAT_SALES_MAPPING.anulado),
        };
      } else {
        colIndices = {
          fecha: normalizedHeaders.indexOf("fecha"),
          serie: normalizedHeaders.indexOf("serie"),
          numero: normalizedHeaders.indexOf("numero"),
          tipo_documento: normalizedHeaders.indexOf("tipo_documento_fel"),
          numero_autorizacion: normalizedHeaders.indexOf("numero_autorizacion"),
          nit: normalizedHeaders.indexOf("nit_cliente"),
          nombre: normalizedHeaders.indexOf("nombre_cliente"),
          total: normalizedHeaders.indexOf("total"),
          iva: normalizedHeaders.indexOf("iva"),
          anulado: -1,
        };
      }

      // Validate required columns
      const requiredCols = ["fecha", "numero", "numero_autorizacion", "nit", "nombre", "total", "iva"];
      const missingCols = requiredCols.filter(c => colIndices[c] === -1);
      
      if (missingCols.length > 0) {
        throw new Error(`No se encontraron las columnas requeridas: ${missingCols.join(", ")}. Asegúrese de usar el formato de exportación de SAT Guatemala.`);
      }

      // Process rows
      const salesByPeriod = new Map<string, Array<{
        sale: any;
        periodId: number;
      }>>();
      const errors: string[] = [];
      let skippedAnuladas = 0;
      
      for (let i = 1; i < rows.length; i++) {
        const values = rows[i];
        if (!values || values.length < 5) continue;

        // Check if anulado
        if (colIndices.anulado !== -1 && isAnulado(values[colIndices.anulado])) {
          skippedAnuladas++;
          continue;
        }

        // Parse date
        const rawDate = values[colIndices.fecha];
        const fecha = parseDateFlexible(rawDate);
        
        if (!fecha) {
          errors.push(`Fila ${i + 1}: Fecha inválida "${rawDate}"`);
          continue;
        }

        // Parse amounts
        const total = parseNumber(values[colIndices.total]);
        const iva = parseNumber(values[colIndices.iva]);
        const montoNeto = total - iva;

        if (total <= 0) {
          errors.push(`Fila ${i + 1}: Total debe ser mayor a cero`);
          continue;
        }

        // Get other fields
        const serie = sanitizeCSVField(String(values[colIndices.serie] || ""));
        const numero = sanitizeCSVField(String(values[colIndices.numero] || ""));
        const tipoDoc = sanitizeCSVField(String(values[colIndices.tipo_documento] || "FACT"));
        const numAutorizacion = sanitizeCSVField(String(values[colIndices.numero_autorizacion] || ""));
        const nit = sanitizeCSVField(String(values[colIndices.nit] || ""));
        const nombre = sanitizeCSVField(String(values[colIndices.nombre] || ""));

        if (!numero) {
          errors.push(`Fila ${i + 1}: Número de factura es requerido`);
          continue;
        }

        if (!numAutorizacion) {
          errors.push(`Fila ${i + 1}: Número de autorización es requerido`);
          continue;
        }

        if (!nombre) {
          errors.push(`Fila ${i + 1}: Nombre del cliente es requerido`);
          continue;
        }

        // Extract year/month for grouping
        const [yearStr, monthStr] = fecha.split("-");
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          errors.push(`Fila ${i + 1}: Fecha inválida`);
          continue;
        }

        // Find accounting period for this invoice date
        const period = await findAccountingPeriod(enterpriseId, fecha);
        
        if (!period) {
          errors.push(`Fila ${i + 1}: No existe período contable abierto para la fecha ${fecha}`);
          continue;
        }

        const periodKey = `${year}-${String(month).padStart(2, '0')}`;
        
        if (!salesByPeriod.has(periodKey)) {
          salesByPeriod.set(periodKey, []);
        }

        const sale = {
          enterprise_id: enterpriseId,
          accounting_period_id: period.id,
          invoice_series: serie,
          invoice_number: numero,
          invoice_date: fecha,
          fel_document_type: tipoDoc,
          authorization_number: numAutorizacion,
          customer_nit: nit,
          customer_name: nombre,
          net_amount: montoNeto,
          vat_amount: iva,
          total_amount: total,
        };

        salesByPeriod.get(periodKey)!.push({ sale, periodId: period.id });
      }

      if (salesByPeriod.size === 0) {
        let errorMessage = "No se encontraron registros válidos para importar";
        if (skippedAnuladas > 0) {
          errorMessage += `. Se omitieron ${skippedAnuladas} facturas anuladas.`;
        }
        if (errors.length > 0) {
          errorMessage += `\n\nErrores:\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n...y ${errors.length - 5} errores más` : ""}`;
        }
        throw new Error(errorMessage);
      }

      // Insert all sales
      const allSales: any[] = [];
      const importSummary: { period: string; count: number }[] = [];

      for (const [periodKey, periodSales] of salesByPeriod) {
        const [yearStr, monthStr] = periodKey.split("-");
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        
        const salesToInsert = periodSales.map(p => p.sale);
        allSales.push(...salesToInsert);

        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        importSummary.push({
          period: `${monthNames[month - 1]} ${year}`,
          count: periodSales.length,
        });
      }

      // Batch insert all sales
      const { error: insertError } = await supabase
        .from("tab_sales_ledger")
        .insert(allSales);

      if (insertError) throw insertError;

      const totalImported = allSales.length;
      const summaryText = importSummary.map(s => `${s.count} en ${s.period}`).join(", ");
      let message = `Se importaron ${totalImported} registros: ${summaryText}`;
      
      if (skippedAnuladas > 0) {
        message += `. Se omitieron ${skippedAnuladas} facturas anuladas.`;
      }
      if (errors.length > 0) {
        message += ` ${errors.length} filas con errores fueron omitidas.`;
      }

      toast({
        title: "Importación exitosa",
        description: message,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error al importar",
        description: getSafeErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Facturas de Ventas</DialogTitle>
          <DialogDescription>
            Carga un archivo CSV o Excel exportado de SAT Guatemala. Las facturas se asignarán automáticamente al período contable según su fecha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Descargar Plantilla
            </Button>
          </div>

          <div
            {...dragProps}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragging && "border-primary bg-primary/5",
              !isDragging && "border-border"
            )}
          >
            <Upload className={cn("h-12 w-12 mx-auto mb-4", isDragging ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm text-muted-foreground mb-4">
              {isDragging ? "Suelta el archivo aquí" : "Arrastra un archivo CSV o Excel, o haz clic para seleccionar"}
            </p>
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload-sales"
              disabled={importing}
            />
            <label htmlFor="file-upload-sales">
              <Button variant="outline" disabled={importing} asChild>
                <span>{importing ? "Importando..." : "Seleccionar Archivo"}</span>
              </Button>
            </label>
          </div>

          <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
            <p className="font-medium mb-2">Formato SAT Guatemala - Columnas utilizadas:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>Fecha de emisión:</strong> DD/MM/YYYY, YYYY-MM-DD o ISO 8601</li>
              <li><strong>Número de Autorización:</strong> Número de autorización FEL</li>
              <li><strong>Serie:</strong> Serie de la factura</li>
              <li><strong>Número del DTE:</strong> Número de factura</li>
              <li><strong>Tipo de DTE:</strong> Tipo de documento</li>
              <li><strong>ID del receptor:</strong> NIT del cliente</li>
              <li><strong>Nombre completo del receptor:</strong> Nombre del cliente</li>
              <li><strong>Gran Total (Moneda Original):</strong> Monto total</li>
              <li><strong>IVA (monto de este impuesto):</strong> Monto del IVA</li>
              <li><strong>Marca de anulado:</strong> Se excluyen facturas anuladas (S/Si/No)</li>
            </ul>
            <p className="mt-3 text-xs text-primary font-medium">
              Soporta archivos CSV, XLS y XLSX exportados directamente de SAT.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFileDrop } from "@/hooks/use-file-drop";
import { supabase } from "@/integrations/supabase/client";
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
import { salesSchema } from "@/utils/csvValidation";
import { getSafeErrorMessage, sanitizeCSVField } from "@/utils/errorMessages";

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

export function ImportSalesDialog({
  open,
  onOpenChange,
  enterpriseId,
  onSuccess,
}: ImportSalesDialogProps) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);

  const { isDragging, dragProps } = useFileDrop({
    accept: [".csv", "text/csv"],
    onFile: (file) => handleImport(file),
    onError: (message) => toast({ variant: "destructive", title: "Error", description: message }),
    disabled: importing,
  });

  const downloadTemplate = () => {
    const headers = [
      "serie",
      "numero",
      "fecha",
      "tipo_documento_fel",
      "numero_autorizacion",
      "nit_cliente",
      "nombre_cliente",
      "monto_neto",
      "iva",
      "total"
    ];

    const csvContent = headers.join(",") + "\n" +
      "A,12345,2025-01-15,FACT,ABC123456789,12345678,Cliente Ejemplo,100.00,12.00,112.00\n" +
      "B,67890,2025-02-20,FACT,DEF987654321,87654321,Otro Cliente,200.00,24.00,224.00";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_ventas.csv";
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
      const text = await file.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error("El archivo está vacío o no tiene datos");
      }

      // Validate headers
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const requiredHeaders = ["serie", "numero", "fecha", "tipo_documento_fel", "numero_autorizacion", 
                               "nit_cliente", "nombre_cliente", "monto_neto", "iva", "total"];
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new Error(`Faltan columnas requeridas: ${missingHeaders.join(", ")}`);
      }

      // Group sales by period for summary
      const salesByPeriod = new Map<string, Array<{
        sale: any;
        periodId: number;
      }>>();
      const errors: string[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim());
        if (values.length < requiredHeaders.length) continue;

        const rowData = {
          serie: sanitizeCSVField(values[headers.indexOf("serie")]),
          numero: sanitizeCSVField(values[headers.indexOf("numero")]),
          fecha: values[headers.indexOf("fecha")],
          tipo_documento_fel: sanitizeCSVField(values[headers.indexOf("tipo_documento_fel")]),
          numero_autorizacion: sanitizeCSVField(values[headers.indexOf("numero_autorizacion")]),
          nit_cliente: sanitizeCSVField(values[headers.indexOf("nit_cliente")]),
          nombre_cliente: sanitizeCSVField(values[headers.indexOf("nombre_cliente")]),
          monto_neto: parseFloat(values[headers.indexOf("monto_neto")]),
          iva: parseFloat(values[headers.indexOf("iva")]),
          total: parseFloat(values[headers.indexOf("total")]),
        };

        // Validate row with zod schema
        const validation = salesSchema.safeParse(rowData);
        
        if (!validation.success) {
          errors.push(`Fila ${i + 1}: ${validation.error.errors[0].message}`);
          continue;
        }

        // Additional business logic validation
        const expectedTotal = rowData.monto_neto + rowData.iva;
        if (Math.abs(expectedTotal - rowData.total) > 0.01) {
          errors.push(`Fila ${i + 1}: El total no coincide con monto_neto + IVA`);
          continue;
        }

        // Validate date format
        const dateParts = rowData.fecha.split("-");
        if (dateParts.length !== 3) {
          errors.push(`Fila ${i + 1}: Formato de fecha inválido. Use YYYY-MM-DD`);
          continue;
        }

        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]);
        
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          errors.push(`Fila ${i + 1}: Fecha inválida`);
          continue;
        }

        // Find accounting period for this invoice date
        const period = await findAccountingPeriod(enterpriseId, rowData.fecha);
        
        if (!period) {
          errors.push(`Fila ${i + 1}: No existe período contable abierto para la fecha ${rowData.fecha}`);
          continue;
        }

        const periodKey = `${year}-${String(month).padStart(2, '0')}`;
        
        if (!salesByPeriod.has(periodKey)) {
          salesByPeriod.set(periodKey, []);
        }

        const sale = {
          enterprise_id: enterpriseId,
          accounting_period_id: period.id,
          invoice_series: rowData.serie,
          invoice_number: rowData.numero,
          invoice_date: rowData.fecha,
          fel_document_type: rowData.tipo_documento_fel,
          authorization_number: rowData.numero_autorizacion,
          customer_nit: rowData.nit_cliente,
          customer_name: rowData.nombre_cliente,
          net_amount: rowData.monto_neto,
          vat_amount: rowData.iva,
          total_amount: rowData.total,
        };

        salesByPeriod.get(periodKey)!.push({ sale, periodId: period.id });
      }

      if (salesByPeriod.size === 0) {
        if (errors.length > 0) {
          throw new Error(`Errores de validación:\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n...y ${errors.length - 5} errores más` : ""}`);
        }
        throw new Error("No se encontraron registros válidos para importar");
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
      const message = errors.length > 0 
        ? `Se importaron ${totalImported} registros (${summaryText}). ${errors.length} filas con errores fueron omitidas.`
        : `Se importaron ${totalImported} registros: ${summaryText}`;

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
            Carga un archivo CSV con facturas de ventas. Las facturas se asignarán automáticamente al período contable según su fecha.
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
              {isDragging ? "Suelta el archivo aquí" : "Arrastra un archivo CSV o haz clic para seleccionar"}
            </p>
            <input
              type="file"
              accept=".csv"
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
            <p className="font-medium mb-2">Campos requeridos en el CSV:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li><strong>serie:</strong> Serie de la factura (ej. A)</li>
              <li><strong>numero:</strong> Número de factura</li>
              <li><strong>fecha:</strong> Fecha en formato YYYY-MM-DD (las facturas se organizan por mes automáticamente)</li>
              <li><strong>tipo_documento_fel:</strong> Tipo de documento FEL</li>
              <li><strong>numero_autorizacion:</strong> Número de autorización</li>
              <li><strong>nit_cliente:</strong> NIT del cliente</li>
              <li><strong>nombre_cliente:</strong> Nombre del cliente</li>
              <li><strong>monto_neto:</strong> Monto sin IVA</li>
              <li><strong>iva:</strong> Monto del IVA</li>
              <li><strong>total:</strong> Monto total con IVA</li>
            </ul>
            <p className="mt-3 text-xs text-primary font-medium">
              💡 Puedes importar facturas de distintos meses en un solo archivo. Se organizarán automáticamente por período contable.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

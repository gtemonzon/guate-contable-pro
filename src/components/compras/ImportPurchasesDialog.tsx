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
import { purchasesSchema } from "@/utils/csvValidation";
import { getSafeErrorMessage, sanitizeCSVField } from "@/utils/errorMessages";

interface ImportPurchasesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number | null;
  bookId?: number | null;
  onSuccess: () => void;
}

export function ImportPurchasesDialog({
  open,
  onOpenChange,
  enterpriseId,
  bookId,
  onSuccess,
}: ImportPurchasesDialogProps) {
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
      "nit_proveedor",
      "nombre_proveedor",
      "monto_base",
      "iva",
      "total",
      "ref_pago"
    ];

    const csvContent = headers.join(",") + "\n" +
      "A,12345,2025-01-15,FACT,12345678,Proveedor Ejemplo,100.00,12.00,112.00,ch. 123";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_compras.csv";
    link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
  };

  const handleImport = async (file: File) => {
    if (!enterpriseId || !bookId) {
      toast({
        title: "Error",
        description: "No se ha seleccionado un libro de compras",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error("El archivo está vacío o no tiene datos");
      }

      // Validar encabezados
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const requiredHeaders = ["serie", "numero", "fecha", "tipo_documento_fel", 
                               "nit_proveedor", "nombre_proveedor", "monto_base", "iva", "total"];
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new Error(`Faltan columnas requeridas: ${missingHeaders.join(", ")}`);
      }

      // Procesar y validar filas
      const purchases = [];
      const errors: string[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim());
        if (values.length < requiredHeaders.length) continue;

        const rowData = {
          serie: sanitizeCSVField(values[headers.indexOf("serie")]),
          numero: sanitizeCSVField(values[headers.indexOf("numero")]),
          fecha: values[headers.indexOf("fecha")],
          tipo_documento_fel: sanitizeCSVField(values[headers.indexOf("tipo_documento_fel")]),
          nit_proveedor: sanitizeCSVField(values[headers.indexOf("nit_proveedor")]),
          nombre_proveedor: sanitizeCSVField(values[headers.indexOf("nombre_proveedor")]),
          monto_base: parseFloat(values[headers.indexOf("monto_base")]),
          iva: parseFloat(values[headers.indexOf("iva")]),
          total: parseFloat(values[headers.indexOf("total")]),
        };

        // Validate row with zod schema
        const validation = purchasesSchema.safeParse(rowData);
        
        if (!validation.success) {
          errors.push(`Fila ${i + 1}: ${validation.error.errors[0].message}`);
          continue;
        }

        // Additional business logic validation
        const expectedTotal = rowData.monto_base + rowData.iva;
        if (Math.abs(expectedTotal - rowData.total) > 0.01) {
          errors.push(`Fila ${i + 1}: El total no coincide con monto_base + IVA`);
          continue;
        }

        const refPagoIndex = headers.indexOf("ref_pago");
        const purchase = {
          enterprise_id: enterpriseId,
          purchase_book_id: bookId,
          invoice_series: rowData.serie,
          invoice_number: rowData.numero,
          invoice_date: rowData.fecha,
          fel_document_type: rowData.tipo_documento_fel,
          supplier_nit: rowData.nit_proveedor,
          supplier_name: rowData.nombre_proveedor,
          base_amount: rowData.monto_base,
          vat_amount: rowData.iva,
          net_amount: rowData.monto_base,
          total_amount: rowData.total,
          batch_reference: refPagoIndex >= 0 ? sanitizeCSVField(values[refPagoIndex]) : "",
        };

        purchases.push(purchase);
      }

      if (errors.length > 0 && purchases.length === 0) {
        throw new Error(`Errores de validación:\n${errors.slice(0, 5).join("\n")}${errors.length > 5 ? `\n...y ${errors.length - 5} errores más` : ""}`);
      }

      if (purchases.length === 0) {
        throw new Error("No se encontraron registros válidos para importar");
      }

      // Insertar en la base de datos
      const { error } = await supabase
        .from("tab_purchase_ledger")
        .insert(purchases);

      if (error) throw error;

      const message = errors.length > 0 
        ? `Se importaron ${purchases.length} registros. ${errors.length} filas con errores fueron omitidas.`
        : `Se importaron ${purchases.length} registros de compras`;

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
          <DialogTitle>Importar Facturas de Compras</DialogTitle>
          <DialogDescription>
            Carga un archivo CSV con las facturas de compras
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
              id="file-upload-purchases"
              disabled={importing}
            />
            <label htmlFor="file-upload-purchases">
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
              <li><strong>fecha:</strong> Fecha en formato YYYY-MM-DD</li>
              <li><strong>tipo_documento_fel:</strong> Tipo de documento FEL</li>
              <li><strong>nit_proveedor:</strong> NIT del proveedor</li>
              <li><strong>nombre_proveedor:</strong> Nombre del proveedor</li>
              <li><strong>monto_base:</strong> Monto sin IVA</li>
              <li><strong>iva:</strong> Monto del IVA</li>
              <li><strong>total:</strong> Monto total con IVA</li>
              <li><strong>ref_pago:</strong> Referencia de pago (ej. ch. 123)</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

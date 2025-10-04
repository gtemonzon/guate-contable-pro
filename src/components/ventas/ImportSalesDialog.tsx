import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
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

interface ImportSalesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number | null;
  onSuccess: () => void;
}

export function ImportSalesDialog({
  open,
  onOpenChange,
  enterpriseId,
  onSuccess,
}: ImportSalesDialogProps) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);

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
      "A,12345,2025-01-15,FACT,ABC123456789,12345678,Cliente Ejemplo,100.00,12.00,112.00";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "plantilla_ventas.csv";
    link.click();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !enterpriseId) return;

    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error("El archivo está vacío o no tiene datos");
      }

      // Validar encabezados
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const requiredHeaders = ["serie", "numero", "fecha", "tipo_documento_fel", "numero_autorizacion", 
                               "nit_cliente", "nombre_cliente", "monto_neto", "iva", "total"];
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        throw new Error(`Faltan columnas requeridas: ${missingHeaders.join(", ")}`);
      }

      // Procesar filas
      const sales = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map(v => v.trim());
        if (values.length < requiredHeaders.length) continue;

        const sale = {
          enterprise_id: enterpriseId,
          invoice_series: values[headers.indexOf("serie")],
          invoice_number: values[headers.indexOf("numero")],
          invoice_date: values[headers.indexOf("fecha")],
          fel_document_type: values[headers.indexOf("tipo_documento_fel")],
          authorization_number: values[headers.indexOf("numero_autorizacion")],
          customer_nit: values[headers.indexOf("nit_cliente")],
          customer_name: values[headers.indexOf("nombre_cliente")],
          net_amount: parseFloat(values[headers.indexOf("monto_neto")]) || 0,
          vat_amount: parseFloat(values[headers.indexOf("iva")]) || 0,
          total_amount: parseFloat(values[headers.indexOf("total")]) || 0,
        };

        sales.push(sale);
      }

      if (sales.length === 0) {
        throw new Error("No se encontraron registros válidos para importar");
      }

      // Insertar en la base de datos
      const { error } = await supabase
        .from("tab_sales_ledger")
        .insert(sales);

      if (error) throw error;

      toast({
        title: "Importación exitosa",
        description: `Se importaron ${sales.length} registros de ventas`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error al importar",
        description: error.message,
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
            Carga un archivo CSV con las facturas de ventas
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="flex-1">
              <Download className="h-4 w-4 mr-2" />
              Descargar Plantilla
            </Button>
          </div>

          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Arrastra un archivo CSV o haz clic para seleccionar
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
              <li><strong>fecha:</strong> Fecha en formato YYYY-MM-DD</li>
              <li><strong>tipo_documento_fel:</strong> Tipo de documento FEL</li>
              <li><strong>numero_autorizacion:</strong> Número de autorización</li>
              <li><strong>nit_cliente:</strong> NIT del cliente</li>
              <li><strong>nombre_cliente:</strong> Nombre del cliente</li>
              <li><strong>monto_neto:</strong> Monto sin IVA</li>
              <li><strong>iva:</strong> Monto del IVA</li>
              <li><strong>total:</strong> Monto total con IVA</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

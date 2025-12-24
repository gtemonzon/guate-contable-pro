import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useFileDrop } from "@/hooks/use-file-drop";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportAccountsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enterpriseId: number | null;
  onSuccess: () => void;
}

export function ImportAccountsDialog({
  open,
  onOpenChange,
  enterpriseId,
  onSuccess,
}: ImportAccountsDialogProps) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);

  const { isDragging, dragProps } = useFileDrop({
    accept: [".csv", "text/csv"],
    onFile: (file) => handleImport(file),
    onError: (message) => toast({ variant: "destructive", title: "Error", description: message }),
    disabled: importing,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
  };

  const handleImport = async (file: File) => {
    if (!enterpriseId) return;

    setImporting(true);
    
    // TODO: Implement CSV parsing and bulk insert
    toast({
      title: "Función en desarrollo",
      description: "La importación de cuentas estará disponible próximamente",
    });

    setImporting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Catálogo de Cuentas</DialogTitle>
          <DialogDescription>
            Carga un archivo CSV con las cuentas contables
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
              id="file-upload"
              disabled={importing}
            />
            <label htmlFor="file-upload">
              <Button variant="outline" disabled={importing} asChild>
                <span>Seleccionar Archivo</span>
              </Button>
            </label>
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">Formato del archivo CSV:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>codigo_cuenta</li>
              <li>nombre_cuenta</li>
              <li>tipo_cuenta (activo, pasivo, capital, ingreso, gasto, costo)</li>
              <li>cuenta_padre (código de la cuenta padre)</li>
              <li>nivel (1-10)</li>
              <li>permite_movimiento (true/false)</li>
              <li>requiere_centro_costo (true/false)</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

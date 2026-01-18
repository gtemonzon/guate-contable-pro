import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FileText, FileSpreadsheet } from "lucide-react";

export interface FolioExportOptions {
  format: 'excel' | 'pdf';
  includeFolio: boolean;
  startingFolio: number;
}

interface FolioExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: FolioExportOptions) => void;
  title?: string;
}

export function FolioExportDialog({
  open,
  onOpenChange,
  onExport,
  title = "Exportar Reporte"
}: FolioExportDialogProps) {
  const [includeFolio, setIncludeFolio] = useState(false);
  const [startingFolio, setStartingFolio] = useState(1);

  const handleExport = (format: 'excel' | 'pdf') => {
    onExport({
      format,
      includeFolio: format === 'pdf' ? includeFolio : false,
      startingFolio: includeFolio ? startingFolio : 1,
    });
    onOpenChange(false);
    // Reset for next time
    setIncludeFolio(false);
    setStartingFolio(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Selecciona el formato de exportación y las opciones de folio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Folio Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="include-folio">Incluir número de folio</Label>
                <p className="text-sm text-muted-foreground">
                  Agrega numeración de folio a cada página del PDF
                </p>
              </div>
              <Switch
                id="include-folio"
                checked={includeFolio}
                onCheckedChange={setIncludeFolio}
              />
            </div>

            {includeFolio && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <Label htmlFor="starting-folio">Folio inicial</Label>
                <Input
                  id="starting-folio"
                  type="number"
                  min={1}
                  value={startingFolio}
                  onChange={(e) => setStartingFolio(Math.max(1, parseInt(e.target.value) || 1))}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">
                  El número de folio se incrementará en cada página
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => handleExport('excel')}
            className="w-full sm:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
          <Button
            onClick={() => handleExport('pdf')}
            className="w-full sm:w-auto"
          >
            <FileText className="h-4 w-4 mr-2" />
            Exportar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

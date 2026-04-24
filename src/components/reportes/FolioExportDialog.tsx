import { useEffect, useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, FileSpreadsheet, AlertTriangle, BookOpen, Loader2 } from "lucide-react";
import {
  useBookAuthorizations,
  BookType,
  BookAuthorization,
  FolioStatus,
  BOOK_TYPE_LABELS,
} from "@/hooks/useBookAuthorizations";

export interface FolioExportOptions {
  format: 'excel' | 'pdf';
  includeFolio: boolean;
  startingFolio: number;
  estimatedPages: number;
  authorization?: {
    id: number;
    number: string;
    date: string;
    bookType: BookType;
    enterpriseId: number;
  };
}

interface FolioExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (options: FolioExportOptions) => void;
  title?: string;
  warningMessage?: string;
  bookType?: BookType;
  enterpriseId?: number;
  /** Callback opcional para estimar las páginas que generará el PDF. */
  estimatePageCount?: () => number | Promise<number>;
}

export function FolioExportDialog({
  open,
  onOpenChange,
  onExport,
  title = "Exportar Reporte",
  warningMessage,
  bookType,
  enterpriseId,
  estimatePageCount,
}: FolioExportDialogProps) {
  const [includeFolio, setIncludeFolio] = useState(false);
  const [startingFolio, setStartingFolio] = useState(1);
  const [estimatedPages, setEstimatedPages] = useState(1);
  const [estimating, setEstimating] = useState(false);
  const [activeAuth, setActiveAuth] = useState<{ auth: BookAuthorization; status: FolioStatus } | null>(null);
  const { getActiveAuthorizationForBook } = useBookAuthorizations(enterpriseId);

  useEffect(() => {
    if (!open) {
      setActiveAuth(null);
      setIncludeFolio(false);
      setStartingFolio(1);
      setEstimatedPages(1);
      return;
    }

    // Estimar páginas con el reporte actualmente generado
    if (estimatePageCount) {
      setEstimating(true);
      Promise.resolve(estimatePageCount())
        .then((pages) => setEstimatedPages(Math.max(1, pages)))
        .catch(() => setEstimatedPages(1))
        .finally(() => setEstimating(false));
    }

    if (!bookType || !enterpriseId) return;
    (async () => {
      const result = await getActiveAuthorizationForBook(enterpriseId, bookType);
      setActiveAuth(result);
      if (result) {
        const used = result.status.used;
        setStartingFolio(Math.max(1, used + 1));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookType, enterpriseId]);

  const handleExport = (format: 'excel' | 'pdf') => {
    // Solo enviar autorización (= consumir folios) cuando el usuario
    // explícitamente activa "Incluir número de folio" en un PDF.
    const willConsumeFolios = format === 'pdf' && includeFolio && !!activeAuth && !!bookType && !!enterpriseId;

    onExport({
      format,
      includeFolio: format === 'pdf' ? includeFolio : false,
      startingFolio: includeFolio ? startingFolio : 1,
      estimatedPages,
      authorization: willConsumeFolios
        ? {
            id: activeAuth!.auth.id,
            number: activeAuth!.auth.authorization_number,
            date: new Date(activeAuth!.auth.authorization_date).toLocaleDateString(),
            bookType: bookType!,
            enterpriseId: enterpriseId!,
          }
        : undefined,
    });
    onOpenChange(false);
  };

  const projectedAvailable = activeAuth && includeFolio ? activeAuth.status.available - estimatedPages : null;

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
          {warningMessage && (
            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-foreground">
                {warningMessage}
              </AlertDescription>
            </Alert>
          )}

          {bookType && (
            <>
              {!activeAuth ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    No hay autorización SAT registrada para <strong>{BOOK_TYPE_LABELS[bookType]}</strong>.
                    Configúrala en <strong>Empresas → editar empresa → Libros SAT</strong>.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="border-primary/50 bg-primary/5">
                  <BookOpen className="h-4 w-4" />
                  <AlertDescription className="text-foreground space-y-1">
                    <div><strong>Autorización SAT:</strong> {activeAuth.auth.authorization_number}</div>
                    <div><strong>Folios disponibles:</strong> {activeAuth.status.available}</div>
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label htmlFor="include-folio">Incluir número de folio</Label>
                <p className="text-sm text-muted-foreground">
                  Numera el PDF con folios SAT y descuenta del libro autorizado.
                  Desactívalo para generar PDFs internos sin consumir folios.
                </p>
              </div>
              <Switch
                id="include-folio"
                checked={includeFolio}
                onCheckedChange={setIncludeFolio}
                disabled={!!bookType && !activeAuth}
              />
            </div>

            {includeFolio && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200 rounded-md border bg-muted/30 p-3">
                <div className="space-y-2">
                  <Label htmlFor="starting-folio">Folio inicial</Label>
                  <Input
                    id="starting-folio"
                    type="number"
                    min={1}
                    value={startingFolio}
                    onChange={(e) => setStartingFolio(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                  <p className="text-xs text-muted-foreground">
                    El folio se incrementa una unidad por cada página impresa.
                  </p>
                </div>

                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Páginas estimadas del PDF:</span>
                    {estimating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <strong>{estimatedPages}</strong>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Calculadas automáticamente según el reporte generado. El consumo real se registrará con el número exacto de páginas emitidas.
                  </p>
                </div>

                {activeAuth && projectedAvailable !== null && projectedAvailable < 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>ATENCIÓN:</strong> faltarán {Math.abs(projectedAvailable)} folios para esta emisión.
                    </AlertDescription>
                  </Alert>
                )}
                {activeAuth && projectedAvailable !== null && projectedAvailable >= 0 && projectedAvailable <= 10 && (
                  <Alert className="border-amber-500/50 bg-amber-500/10">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-foreground">
                      Quedarán <strong>{projectedAvailable}</strong> folios disponibles. Considera autorizar más folios.
                    </AlertDescription>
                  </Alert>
                )}
                {activeAuth && projectedAvailable !== null && projectedAvailable > 10 && (
                  <p className="text-xs text-muted-foreground">
                    Quedarán {projectedAvailable} folios disponibles después de esta emisión.
                  </p>
                )}
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

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Printer } from "lucide-react";
import { subscribePdfPreview, type PdfPreviewRequest } from "@/lib/pdfPreview";
import { downloadPreviewFile, openPreviewFile } from "@/lib/previewActions";
import { useToast } from "@/hooks/use-toast";

/**
 * Visor global de PDF. Se monta una sola vez y escucha las solicitudes
 * enviadas por showPdfPreview / previewPdfDoc / previewPdfBlob.
 */
export default function PdfPreviewHost() {
  const [request, setRequest] = useState<PdfPreviewRequest | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribePdfPreview((req) => setRequest(req)), []);

  const close = () => {
    if (request?.revokeOnClose) URL.revokeObjectURL(request.url);
    setRequest(null);
  };

  const handleAction = async (action: (file: PdfPreviewRequest) => Promise<void>) => {
    if (!request || busy) return;
    setBusy(true);
    try {
      await action(request);
    } catch (error) {
      toast({ title: "No se pudo abrir el archivo", description: error instanceof Error ? error.message : "Intente nuevamente.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-4 gap-3">
        <DialogHeader className="space-y-0">
          <DialogTitle className="text-base truncate pr-8">
            {request?.fileName || "Vista previa"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void handleAction(downloadPreviewFile)} className="gap-2">
            <Download className="h-4 w-4" /> Descargar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => iframeRef.current?.contentWindow?.print()}
            className="gap-2"
          >
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleAction(openPreviewFile)} className="gap-2">
              <ExternalLink className="h-4 w-4" /> Abrir en pestaña nueva
          </Button>
        </div>

        <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden bg-muted">
          {request && (
            <iframe
              ref={iframeRef}
              key={request.url}
              src={request.url}
              title={request.fileName}
              className="w-full h-full"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

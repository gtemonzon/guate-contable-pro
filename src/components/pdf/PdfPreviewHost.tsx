import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { subscribePdfPreview, type PdfPreviewRequest } from "@/lib/pdfPreview";

/**
 * Visor global de PDF. Se monta una sola vez y escucha las solicitudes
 * enviadas por showPdfPreview / previewPdfDoc / previewPdfBlob.
 */
export default function PdfPreviewHost() {
  const [request, setRequest] = useState<PdfPreviewRequest | null>(null);

  useEffect(() => subscribePdfPreview((req) => setRequest(req)), []);

  const close = () => {
    if (request?.revokeOnClose) URL.revokeObjectURL(request.url);
    setRequest(null);
  };

  const handleDownload = () => {
    if (!request) return;
    const a = document.createElement("a");
    a.href = request.url;
    a.download = request.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
          <Button size="sm" onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" /> Descargar
          </Button>
          <Button size="sm" variant="outline" asChild className="gap-2">
            <a href={request?.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Abrir en pestaña nueva
            </a>
          </Button>
        </div>

        <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden bg-muted">
          {request && (
            <iframe
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

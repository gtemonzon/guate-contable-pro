import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Minus, Plus, Printer } from "lucide-react";

export interface ImagePreviewRequest {
  url: string;
  fileName: string;
  revokeOnClose?: boolean;
}

type Listener = (request: ImagePreviewRequest) => void;
const listeners = new Set<Listener>();

export function showImagePreview(request: ImagePreviewRequest) {
  listeners.forEach((listener) => listener(request));
}

export default function ImagePreviewHost() {
  const [request, setRequest] = useState<ImagePreviewRequest | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const listener: Listener = (nextRequest) => {
      setScale(1);
      setRequest(nextRequest);
    };
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  const close = () => {
    if (request?.revokeOnClose) URL.revokeObjectURL(request.url);
    setRequest(null);
  };

  const download = () => {
    if (!request) return;
    const link = document.createElement("a");
    link.href = request.url;
    link.download = request.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const print = () => {
    if (!request) return;
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html><html><head><title>${escapeHtml(request.fileName)}</title><style>html,body{margin:0;min-height:100%;display:grid;place-items:center}img{max-width:100%;max-height:100vh;object-fit:contain}</style></head><body><img src="${request.url}" alt="${escapeHtml(request.fileName)}" /></body></html>`);
    printWindow.document.close();
    printWindow.addEventListener("load", () => printWindow.print(), { once: true });
  };

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] flex flex-col p-4 gap-3">
        <DialogHeader className="space-y-0">
          <DialogTitle className="truncate pr-8">{request?.fileName || "Vista previa"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={download} className="gap-2"><Download className="h-4 w-4" /> Descargar</Button>
          <Button size="sm" variant="outline" onClick={print} className="gap-2"><Printer className="h-4 w-4" /> Imprimir</Button>
          <Button size="icon" variant="outline" onClick={() => setScale((value) => Math.max(0.5, value - 0.25))} aria-label="Reducir zoom"><Minus className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => setScale((value) => Math.min(3, value + 0.25))} aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" asChild className="gap-2"><a href={request?.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Abrir en pestaña nueva</a></Button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border bg-muted/30 p-4">
          {request && <img src={request.url} alt={request.fileName} className="mx-auto max-w-none origin-top transition-transform" style={{ transform: `scale(${scale})` }} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] ?? character);
}

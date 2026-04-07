import { useState } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Attachment {
  id: number;
  file_url: string;
  file_name: string;
}

interface MessageAttachmentsProps {
  attachments: Attachment[];
}

export default function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const [preview, setPreview] = useState<Attachment | null>(null);

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div className="flex gap-2 mt-2 flex-wrap">
        {attachments.map((att) => (
          <button
            key={att.id}
            type="button"
            onClick={() => setPreview(att)}
            className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer"
          >
            <img
              src={att.file_url}
              alt={att.file_name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* Full preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl p-2">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm text-muted-foreground truncate max-w-[60%]">
              {preview?.file_name}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <a href={preview?.file_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Abrir
                </a>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <a href={preview?.file_url} download={preview?.file_name}>
                  <Download className="h-4 w-4 mr-1" />
                  Descargar
                </a>
              </Button>
            </div>
          </div>
          <div className="flex justify-center max-h-[70vh] overflow-auto">
            <img
              src={preview?.file_url || ""}
              alt={preview?.file_name || ""}
              className="max-w-full object-contain rounded"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

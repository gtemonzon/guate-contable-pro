import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, compressPdf } from "@/lib/pdfCompression";
import { compressImage } from "@/lib/imageCompression";
import { showPdfPreview } from "@/lib/pdfPreview";
import { showImagePreview } from "@/components/ui/image-preview-host";
import { File, FileImage, FileSpreadsheet, FileText, FileType, Download, Eye, Trash2, Upload } from "lucide-react";

interface AssetAttachment {
  id: number;
  asset_id: number;
  enterprise_id: number;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  original_size: number | null;
  uploaded_at: string;
  is_active: boolean;
}

interface Props {
  assetId: number;
  enterpriseId: number;
}

const attachmentTable = () => supabase.from("fixed_asset_attachments" as never);
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default function AssetAttachmentsTab({ assetId, enterpriseId }: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<AssetAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [compressionLabel, setCompressionLabel] = useState("");

  const loadAttachments = async () => {
    setLoading(true);
    const { data, error } = await attachmentTable()
      .select("*")
      .eq("asset_id", assetId)
      .eq("is_active", true)
      .order("uploaded_at", { ascending: false });
    if (error) {
      toast({ title: "Error al cargar adjuntos", description: error.message, variant: "destructive" });
    } else {
      setAttachments((data ?? []) as unknown as AssetAttachment[]);
    }
    setLoading(false);
  };

  useEffect(() => { void loadAttachments(); }, [assetId]);

  const processFile = async (originalFile: File) => {
    if (uploading) return;
    if (originalFile.size > MAX_FILE_SIZE) {
      toast({ title: "Archivo demasiado grande", description: "El límite por archivo es de 50 MB.", variant: "destructive" });
      return;
    }

    try {
      setUploading(true);
      setProgress(10);
      setCompressionLabel("Preparando archivo...");
      let result = { file: originalFile, originalSize: originalFile.size, compressedSize: originalFile.size, compressed: false };
      if (originalFile.type === "application/pdf") {
        result = await compressPdf(originalFile, ({ page, totalPages }) => {
          setProgress(10 + Math.round((page / totalPages) * 35));
          setCompressionLabel(`Comprimiendo PDF · página ${page} de ${totalPages}`);
        });
      } else if (originalFile.type.startsWith("image/")) {
        setProgress(25);
        setCompressionLabel("Comprimiendo imagen...");
        result = await compressImage(originalFile);
      }

      setProgress(55);
      setCompressionLabel("Subiendo archivo...");
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Usuario no autenticado");
      const safeName = result.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${enterpriseId}/${assetId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("fixed-asset-attachments").upload(path, result.file, { contentType: result.file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;

      const { error: insertError } = await attachmentTable().insert({
        asset_id: assetId,
        enterprise_id: enterpriseId,
        file_name: result.file.name,
        file_path: path,
        file_type: result.file.type || "application/octet-stream",
        file_size: result.file.size,
        original_size: result.originalSize,
        uploaded_by: authData.user.id,
      } as never);
      if (insertError) throw insertError;

      setProgress(100);
      setCompressionLabel("");
      toast({ title: "Adjunto subido", description: result.compressed ? `${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)} (${Math.round((1 - result.compressedSize / result.originalSize) * 100)}% menos)` : result.file.name });
      await loadAttachments();
    } catch (error) {
      toast({ title: "Error al subir adjunto", description: error instanceof Error ? error.message : "No se pudo completar la carga.", variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress(0);
      setCompressionLabel("");
    }
  };

  const openAttachment = async (attachment: AssetAttachment) => {
    const { data, error } = await supabase.storage.from("fixed-asset-attachments").createSignedUrl(attachment.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: "No se pudo abrir el archivo", description: error?.message, variant: "destructive" });
      return;
    }
    if (attachment.file_type === "application/pdf") {
      showPdfPreview({ url: data.signedUrl, fileName: attachment.file_name });
    } else if (attachment.file_type?.startsWith("image/")) {
      showImagePreview({ url: data.signedUrl, fileName: attachment.file_name });
    } else {
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = attachment.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
  };

  const removeAttachment = async (attachment: AssetAttachment) => {
    const { error } = await attachmentTable().update({ is_active: false } as never).eq("id", attachment.id);
    if (error) {
      toast({ title: "Error al eliminar adjunto", description: error.message, variant: "destructive" });
      return;
    }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    toast({ title: "Adjunto eliminado" });
  };

  const iconFor = (type: string | null) => {
    if (type?.startsWith("image/")) return FileImage;
    if (type?.includes("spreadsheet") || type?.includes("excel")) return FileSpreadsheet;
    if (type === "application/pdf") return FileText;
    if (type?.includes("word") || type?.includes("document")) return FileType;
    return File;
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border"}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) void processFile(file); }}
      >
        <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Arrastra un archivo aquí</p>
        <p className="mb-3 text-sm text-muted-foreground">PDF, imágenes, Word, Excel y otros archivos · máximo 50 MB</p>
        <Button type="button" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>Seleccionar archivo</Button>
        <input ref={inputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void processFile(file); event.target.value = ""; }} />
      </div>
      {uploading && <div className="space-y-1"><Progress value={progress} /><p className="text-xs text-muted-foreground">{compressionLabel}</p></div>}
      {loading ? <p className="text-sm text-muted-foreground">Cargando adjuntos...</p> : attachments.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No hay documentos adjuntos.</p> : <div className="divide-y rounded-lg border">{attachments.map((attachment) => { const Icon = iconFor(attachment.file_type); const saved = attachment.original_size && attachment.file_size && attachment.file_size < attachment.original_size; return <div key={attachment.id} className="flex items-center gap-3 p-3"><Icon className="h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{attachment.file_name}</p><p className="text-xs text-muted-foreground">{formatBytes(attachment.file_size ?? 0)} · {new Date(attachment.uploaded_at).toLocaleDateString("es-GT")}{saved ? ` · ${formatBytes(attachment.original_size ?? 0)} → ${formatBytes(attachment.file_size ?? 0)} (${Math.round((1 - (attachment.file_size ?? 0) / (attachment.original_size ?? 1)) * 100)}% menos)` : ""}</p></div><Button variant="ghost" size="icon" aria-label="Abrir adjunto" onClick={() => void openAttachment(attachment)}>{attachment.file_type === "application/pdf" || attachment.file_type?.startsWith("image/") ? <Eye className="h-4 w-4" /> : <Download className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" aria-label="Eliminar adjunto" onClick={() => void removeAttachment(attachment)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>; })}</div>}
    </div>
  );
}

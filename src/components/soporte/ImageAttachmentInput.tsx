import { useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus, X } from "lucide-react";
import { compressImage } from "@/utils/imageCompression";
import { useToast } from "@/hooks/use-toast";

interface ImageAttachmentInputProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  maxFiles?: number;
}

const MAX_SIZE_MB = 10;

export default function ImageAttachmentInput({
  files,
  onChange,
  disabled = false,
  maxFiles = 5,
}: ImageAttachmentInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [compressing, setCompressing] = useState(false);

  const processFiles = useCallback(
    async (incoming: FileList | File[]) => {
      const arr = Array.from(incoming).filter((f) => f.type.startsWith("image/"));
      if (arr.length === 0) {
        toast({ title: "Solo se permiten imágenes", variant: "destructive" });
        return;
      }

      const remaining = maxFiles - files.length;
      if (remaining <= 0) {
        toast({ title: `Máximo ${maxFiles} imágenes`, variant: "destructive" });
        return;
      }

      const toProcess = arr.slice(0, remaining);
      setCompressing(true);

      try {
        const compressed = await Promise.all(
          toProcess.map((f) => {
            if (f.size > MAX_SIZE_MB * 1024 * 1024) {
              toast({
                title: `${f.name} supera ${MAX_SIZE_MB} MB, se omitió`,
                variant: "destructive",
              });
              return null;
            }
            return compressImage(f);
          })
        );

        const valid = compressed.filter(Boolean) as File[];
        onChange([...files, ...valid]);
      } finally {
        setCompressing(false);
      }
    },
    [files, onChange, maxFiles, toast]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    },
    [disabled, processFiles]
  );

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div onPaste={handlePaste}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files) processFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || compressing || files.length >= maxFiles}
          onClick={() => inputRef.current?.click()}
          className="h-8 px-2 text-muted-foreground"
        >
          <ImagePlus className="h-4 w-4 mr-1" />
          {compressing ? "Comprimiendo..." : "Imagen"}
        </Button>

        {files.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {files.length}/{maxFiles}
          </span>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {files.map((file, i) => (
            <div
              key={i}
              className="relative group w-16 h-16 rounded-lg border border-border overflow-hidden bg-muted"
            >
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="absolute top-0 right-0 p-0.5 bg-destructive text-destructive-foreground rounded-bl-md opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

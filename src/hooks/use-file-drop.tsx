import { useState, useCallback, DragEvent } from "react";

interface UseFileDropOptions {
  accept?: string[];
  maxSize?: number;
  onFile: (file: File) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

export function useFileDrop({
  accept,
  maxSize,
  onFile,
  onError,
  disabled = false,
}: UseFileDropOptions) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      const file = files[0];

      // Validate file type
      if (accept && accept.length > 0) {
        const fileType = file.type;
        const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`;
        const isValidType = accept.some(
          (type) =>
            type === fileType ||
            type === fileExtension ||
            (type.endsWith("/*") && fileType.startsWith(type.replace("/*", "/")))
        );

        if (!isValidType) {
          onError?.(`Tipo de archivo no permitido. Se aceptan: ${accept.join(", ")}`);
          return;
        }
      }

      // Validate file size
      if (maxSize && file.size > maxSize) {
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
        onError?.(`El archivo supera el tamaño máximo de ${maxSizeMB} MB`);
        return;
      }

      onFile(file);
    },
    [accept, maxSize, onFile, onError, disabled]
  );

  return {
    isDragging,
    dragProps: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}

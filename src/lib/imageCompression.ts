export interface ImageCompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressed: boolean;
}

export async function compressImage(file: File): Promise<ImageCompressionResult> {
  const originalSize = file.size;
  if (!file.type.startsWith("image/")) {
    return { file, originalSize, compressedSize: originalSize, compressed: false };
  }

  try {
    const image = await loadImage(file);
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return { file, originalSize, compressedSize: originalSize, compressed: false };

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!blob || blob.size >= originalSize) {
      return { file, originalSize, compressedSize: originalSize, compressed: false };
    }

    const extension = file.name.toLowerCase().endsWith(".jpg") || file.name.toLowerCase().endsWith(".jpeg") ? "" : ".jpg";
    const outputName = `${file.name.replace(/\.[^.]+$/, "")}${extension}`;
    const compressedFile = new File([blob], outputName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    return { file: compressedFile, originalSize, compressedSize: compressedFile.size, compressed: true };
  } catch (error) {
    console.error("Image compression failed, uploading original:", error);
    return { file, originalSize, compressedSize: originalSize, compressed: false };
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo procesar la imagen"));
    };
    image.src = url;
  });
}

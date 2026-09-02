import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export interface CompressionProgress {
  page: number;
  totalPages: number;
}

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  compressed: boolean;
}

const DPI = 150;
const SCALE = DPI / 72;
const JPEG_QUALITY = 0.75;

export async function compressPdf(
  file: File,
  onProgress?: (progress: CompressionProgress) => void,
): Promise<CompressionResult> {
  const originalSize = file.size;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdfDoc = await loadingTask.promise;
    const newPdf = await PDFDocument.create();

    for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
      onProgress?.({ page: pageNumber, totalPages: pdfDoc.numPages });
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No 2D canvas context");

      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;

      const jpegBytes = dataUrlToBytes(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      const image = await newPdf.embedJpg(jpegBytes);
      const originalViewport = page.getViewport({ scale: 1 });
      const newPage = newPdf.addPage([originalViewport.width, originalViewport.height]);
      newPage.drawImage(image, {
        x: 0,
        y: 0,
        width: originalViewport.width,
        height: originalViewport.height,
      });
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }

    const compressedBytes = await newPdf.save();
    if (compressedBytes.byteLength >= originalSize) {
      return { file, originalSize, compressedSize: originalSize, compressed: false };
    }

    const compressedFile = new File(
      [new Blob([compressedBytes], { type: "application/pdf" })],
      file.name,
      { type: "application/pdf", lastModified: Date.now() },
    );
    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      compressed: true,
    };
  } catch (error) {
    console.error("PDF compression failed, uploading original:", error);
    return { file, originalSize, compressedSize: originalSize, compressed: false };
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

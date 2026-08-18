import type jsPDF from "jspdf";

export interface PdfPreviewRequest {
  /** Blob URL u URL firmada del PDF a mostrar */
  url: string;
  /** Nombre sugerido al descargar */
  fileName: string;
  /** Si el url es un blob creado internamente, se revoca al cerrar */
  revokeOnClose?: boolean;
}

type Listener = (req: PdfPreviewRequest) => void;

const listeners = new Set<Listener>();

export function subscribePdfPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Muestra un PDF ya existente (Storage, URL firmada, blob externo). */
export function showPdfPreview(req: PdfPreviewRequest) {
  listeners.forEach((l) => l(req));
}

/** Muestra un PDF generado con jsPDF sin descargarlo automáticamente. */
export function previewPdfDoc(doc: jsPDF, fileName: string) {
  const name = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  const blob = doc.output("blob") as Blob;
  const url = URL.createObjectURL(blob);
  showPdfPreview({ url, fileName: name, revokeOnClose: true });
}

/** Muestra un Blob descargado (por ejemplo desde Storage). */
export function previewPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  showPdfPreview({ url, fileName, revokeOnClose: true });
}

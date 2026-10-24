export interface PreviewFile {
  url: string;
  fileName: string;
  /** Reauthorize private files for each action rather than reuse an expired URL. */
  resolveUrl?: () => Promise<string>;
}

export async function downloadPreviewFile(request: PreviewFile): Promise<void> {
  const url = request.resolveUrl ? await request.resolveUrl() : request.url;
  // A same-origin blob makes the download attribute work for Storage URLs too.
  const response = await fetch(url);
  if (!response.ok) throw new Error("No se pudo descargar el archivo");
  const blobUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = request.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export async function openPreviewFile(request: PreviewFile): Promise<void> {
  // Reserve the tab during the click so asynchronous authorization isn't blocked.
  const tab = window.open("about:blank", "_blank");
  if (!tab) throw new Error("Permita abrir pestañas nuevas para ver el archivo");
  tab.opener = null;
  try {
    const url = request.resolveUrl ? await request.resolveUrl() : request.url;
    tab.location.replace(url);
  } catch (error) {
    tab.close();
    throw error;
  }
}
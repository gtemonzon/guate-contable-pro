# Inventario de PDFs sin visor previo (solo investigación)

No se propone solución ni cambios. Esto es el inventario verificado por lectura de código.

## Librerías realmente presentes (package.json)
- `jspdf` ^4.2.1 + `jspdf-autotable` ^5.0.2 — toda la generación de PDF.
- `pdfjs-dist` ^6.1.200 — solo LECTURA/extracción de texto (`TaxFormDialog.tsx`, parsing SAT).
- **No existe `pdf-lib` ni `src/utils/pdfCompression.ts`** en el repo (ese archivo no está; solo existe `src/utils/imageCompression.ts`). Tampoco hay ningún visor de PDF hoy: no hay `<iframe>`, `<embed>` ni react-pdf en el código.

## A. PDFs ya existentes en Storage (archivo subido) — hoy solo descarga

### 1. Formularios de Impuestos — `src/pages/FormulariosImpuestos.tsx`
Archivo en bucket `tax-forms` (subido por `src/components/impuestos/TaxFormDialog.tsx`, líneas ~450-467).
Función `handleDownloadPdf` (línea 193):
```tsx
const handleDownloadPdf = async (form: TaxForm) => {
  if (!form.file_path) return;
  try {
    const { data, error } = await supabase.storage
      .from("tax-forms")
      .download(form.file_path);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = form.file_name || "formulario.pdf";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error: unknown) { /* toast */ }
};
```
Botón (línea 380):
```tsx
{form.file_path && (
  <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(form)} title="Descargar PDF">
    <Download className="h-4 w-4" />
  </Button>
)}
```
Sin previsualización: descarga directa vía blob.

### 2. Documentos de Empresa — `src/components/empresas/EnterpriseDocuments.tsx`
Bucket `enterprise-documents`, `accept: [".pdf", "application/pdf"]` (línea 143). `handleDownload` (línea 229):
```tsx
const { data, error } = await supabase.storage
  .from('enterprise-documents')
  .createSignedUrl(document.file_path, 3600); // 1 hour
if (error) throw error;
if (!data?.signedUrl) throw new Error("No se pudo generar URL de descarga");
window.open(data.signedUrl, '_blank');
```
Botón (línea 353): `<Button variant="ghost" size="sm" onClick={() => handleDownload(doc)} title="Ver/Descargar"><Download className="h-4 w-4" /></Button>`.
Es lo más cercano a "ver": abre pestaña nueva con URL firmada, no hay visor in-app.

### 3. Adjuntos de Soporte — `src/components/soporte/MessageAttachments.tsx`
ÚNICO módulo con previsualización, pero solo IMÁGENES (`<img>` en Dialog, líneas 42-78) con botones "Abrir" y "Descargar" (`<a download>`). No acepta PDF (`ImageAttachmentInput.tsx`).

Nota: no existen adjuntos de PDF en Compras/Ventas ni comprobantes por factura. En Compras, el PDF solo se usa como fuente de importación (`ImportPurchasesDialog.tsx` líneas 323-327, `accept=".csv,.xls,.xlsx,.pdf"`), se parsea y se descarta; no se guarda.

## B. PDFs generados en cliente con jsPDF — `doc.save()` directo, sin vista previa

Todos terminan en `doc.save(...)`, que dispara descarga inmediata del navegador.

| # | Módulo | Archivo / función | Disparador |
|---|---|---|---|
| 4 | Reportes genéricos (Balance General, Estado de Resultados, Saldos, Flujo de Efectivo, Compras, Ventas, Variaciones, Facturas por Cuenta, Libro Bancos, Partidas) | `src/utils/reportExport.ts` → `exportToPDF` (línea 249), `doc.save(\`${options.filename}.pdf\`)` (252) | Cada `Reporte*.tsx` llama `exportToPDF({...})` (ver tabla de call sites abajo) |
| 5 | Libro Diario / Partidas formato legal | `src/utils/journalPdfFormats.ts` → `exportJournalEntriesToPDF` (línea 304), `doc.save()` (309) | `ReportePartidas.tsx` |
| 6 | Libro Mayor legal | `src/utils/ledgerPdfFormats.ts` → `renderLegalLedgerPdf` (96) devuelve `{doc, pageCount}`; el `doc.save()` está en `ReporteLibroMayor.tsx:586` dentro de `handleExport` | `FolioExportDialog` (botón "Exportar PDF", línea 278) |
| 7 | Libro de Compras y Ventas | `src/components/reportes/ReporteComprasVentas.tsx`, `doc.save(\`${filenameBase}.pdf\`)` (220) | botón export del componente |
| 8 | Cotizaciones (honorarios, con logo) | `src/components/cotizaciones/quoteExport.ts` → `exportQuoteToPdf` (27), logo vía `loadFaviconDataUrl()`, `doc.save(\`cotizacion_${quote.quote_number}.pdf\`)` (116) | `src/pages/Cotizaciones.tsx:134` `<Button variant="ghost" size="icon" onClick={() => handlePdf(q)} title="PDF"><FileDown className="h-4 w-4" /></Button>` |
| 9 | Retenciones y Exenciones | `src/components/retenciones/certificateExport.ts` → `exportCertificatesToPdf` (33), `doc.save()` (53) | `src/pages/RetencionesExenciones.tsx:126` `<Button variant="outline" onClick={() => exportCertificatesToPdf(certificates)} className="gap-2"><FileText className="h-4 w-4" /> PDF</Button>` |
| 10 | Conciliación Bancaria (estándar) | `src/components/conciliacion/reconciliationExport.ts` → `exportReconciliationPDF` (41), `doc.save()` (167) | `src/pages/ConciliacionBancaria.tsx:1174` `<Button onClick={() => exportReconciliationPDF(lastExport)}><Printer className="h-4 w-4 mr-2" /> Imprimir / PDF</Button>` |
| 11 | Conciliación Cuadrática (formato SAT) | `src/components/conciliacion/QuadraticReconciliationPDF.tsx` → `generateQuadraticPDF` (25), `doc.save()` (106) | `QuadraticReconciliationView.tsx:177` `<Button variant="outline" onClick={handleExport}><FileDown className="h-4 w-4 mr-2" />PDF SAT</Button>` (handler en línea 134) |
| 12 | Manual de Ayuda | `src/pages/Ayuda.tsx`, `doc.save("Manual_de_Ayuda.pdf")` (842) | botón "Descargar manual" |

Call sites de `exportToPDF` (todos sin vista previa):
- `ReporteBalanceGeneral.tsx:465`, `ReporteEstadoResultados.tsx:647`, `ReporteSaldos.tsx:268`, `ReporteFlujoEfectivo.tsx:357`, `ReporteCompras.tsx:311`, `ReporteVentas.tsx:340`, `ReporteVariaciones.tsx:387`, `ReporteFacturasPorCuenta.tsx:316`, `ReporteLibroBancos.tsx:330` (`monochrome: true, pageNumbers: true`).

Nota sobre `FolioExportDialog.tsx`: NO es un visor. Solo pide folio/autorización/modo de descripción y muestra "Páginas estimadas del PDF" usando `estimatePdfPageCount` / `estimateJournalPdfPageCount` (que construyen el doc en memoria y lo descartan). Ese patrón — construir el `jsPDF` sin guardarlo — es el punto de enganche natural para un visor.

## C. Módulos SIN PDF (descartados del inventario)
- Activos Fijos (`AssetReports.tsx`): solo CSV (`a.download = \`activos_fijos_${asOfDate}.csv\``, línea 108).
- Nómina (`ImportPayrollDialog.tsx`): solo plantilla CSV.
- Declaraciones (`DeclaracionPreview.tsx`, `ExportAnexoButton.tsx`): sin generación de PDF.
- Backups (`useEnterpriseBackupRestore.ts`): JSON.
- Importadores de Compras/Ventas/Estado de cuenta: plantillas CSV.

## Pregunta
¿A cuáles de estos grupos querés que apunte la siguiente fase (visor previo): solo los almacenados en Storage (1 y 2), solo los generados con jsPDF (4-12), o ambos?

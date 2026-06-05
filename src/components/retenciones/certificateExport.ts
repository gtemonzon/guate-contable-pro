import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  type TaxCertificate,
  DOCUMENT_TYPE_LABELS,
  DIRECTION_LABELS,
} from "@/hooks/useTaxCertificates";

function rows(certs: TaxCertificate[]) {
  return certs.map((c) => ({
    Fecha: c.issue_date,
    Tipo: DOCUMENT_TYPE_LABELS[c.document_type],
    Direccion: DIRECTION_LABELS[c.direction],
    Documento: c.document_number,
    Autorizacion: c.authorization_number ?? "",
    NIT: c.counterpart_nit,
    Nombre: c.counterpart_name,
    Base: Number(c.base_amount),
    "%": Number(c.percentage),
    Impuesto: Number(c.tax_amount),
    Estado: c.status,
  }));
}

export function exportCertificatesToExcel(certs: TaxCertificate[]) {
  const ws = XLSX.utils.json_to_sheet(rows(certs));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Constancias");
  XLSX.writeFile(wb, `retenciones_exenciones_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportCertificatesToPdf(certs: TaxCertificate[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Retenciones y Exenciones", 14, 14);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString("es-GT")}`, 14, 20);

  const data = rows(certs).map((r) => [
    r.Fecha, r.Tipo, r.Direccion, r.Documento, r.NIT, r.Nombre,
    r.Base.toFixed(2), `${r["%"]}%`, r.Impuesto.toFixed(2), r.Estado,
  ]);

  autoTable(doc, {
    startY: 26,
    head: [["Fecha", "Tipo", "Dirección", "Documento", "NIT", "Nombre", "Base", "%", "Impuesto", "Estado"]],
    body: data,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [60, 60, 60] },
  });

  doc.save(`retenciones_exenciones_${new Date().toISOString().slice(0, 10)}.pdf`);
}

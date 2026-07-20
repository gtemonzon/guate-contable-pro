import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { Quote, QuoteItem } from "@/hooks/useQuotes";
import { formatCurrency } from "@/lib/utils";

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function loadFaviconDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/favicon.png");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportQuoteToPdf(quote: Quote, items: QuoteItem[]) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;

  // Logo
  const logo = await loadFaviconDataUrl();
  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 36, 48, 48); } catch { /* ignore */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("COTIZACIÓN DE SERVICIOS", pageW - margin, 56, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`No. ${quote.quote_number}`, pageW - margin, 74, { align: "right" });
  doc.text(`Fecha: ${formatDate(quote.issue_date)}`, pageW - margin, 88, { align: "right" });
  if (quote.valid_until) {
    doc.text(`Vigencia: ${formatDate(quote.valid_until)}`, pageW - margin, 102, { align: "right" });
  }

  let y = 120;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Cliente:", margin, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.text(quote.client_name, margin, y);
  if (quote.client_nit) { y += 12; doc.text(`NIT: ${quote.client_nit}`, margin, y); }
  if (quote.client_contact) { y += 12; doc.text(`Contacto: ${quote.client_contact}`, margin, y); }

  y += 24;
  doc.setFontSize(10);
  const intro = "Por medio de la presente, me permito cotizar los siguientes servicios contables:";
  doc.text(intro, margin, y, { maxWidth: pageW - margin * 2 });

  y += 20;
  autoTable(doc, {
    startY: y,
    head: [["Descripción", "Cantidad", "P. Unitario", "Subtotal"]],
    body: items.map((it) => [
      it.description,
      Number(it.quantity).toString(),
      `Q ${formatCurrency(Number(it.unit_price))}`,
      `Q ${formatCurrency(Number(it.line_total))}`,
    ]),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [60, 60, 60] },
    columnStyles: {
      1: { halign: "right", cellWidth: 60 },
      2: { halign: "right", cellWidth: 90 },
      3: { halign: "right", cellWidth: 90 },
    },
    margin: { left: margin, right: margin },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`TOTAL: Q ${formatCurrency(Number(quote.total))}`, pageW - margin, finalY, { align: "right" });

  let cy = finalY + 32;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const conditions = quote.valid_until
    ? `Esta cotización tiene una vigencia hasta el ${formatDate(quote.valid_until)}. Precios expresados en Quetzales (GTQ).`
    : "Precios expresados en Quetzales (GTQ).";
  doc.text(conditions, margin, cy, { maxWidth: pageW - margin * 2 });

  if (quote.notes) {
    cy += 24;
    doc.setFont("helvetica", "bold");
    doc.text("Notas:", margin, cy);
    doc.setFont("helvetica", "normal");
    cy += 12;
    doc.text(quote.notes, margin, cy, { maxWidth: pageW - margin * 2 });
  }

  // Signature
  const sigY = doc.internal.pageSize.getHeight() - 90;
  doc.setDrawColor(0);
  doc.line(pageW / 2 - 100, sigY, pageW / 2 + 100, sigY);
  doc.setFontSize(10);
  doc.text("Estuardo Monzón", pageW / 2, sigY + 14, { align: "center" });
  doc.setFontSize(9);
  doc.text("Contador Público y Auditor", pageW / 2, sigY + 26, { align: "center" });

  doc.save(`cotizacion_${quote.quote_number}.pdf`);
}

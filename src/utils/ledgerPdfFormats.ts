/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Legal General Ledger (Libro Mayor) PDF renderer.
 *
 * Presentation goals:
 *  - Traditional accounting ledger look (no full grid / no boxed cells).
 *  - Monochrome, low-toner; horizontal rules only.
 *  - Smart continuation: "Continúa en la siguiente página…" appears ONLY when
 *    the account truly continues; never on the final page of an account.
 *  - Reference column extracted from description.
 *  - Description modes: full | short | none.
 *  - Folios OR "Página X de Y" — never both.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency } from "@/lib/utils";

export type LedgerDescriptionMode = "full" | "short" | "none";

export interface LedgerPdfEntry {
  entry_date: string;
  entry_number: string;
  description: string;
  debit_amount: number;
  credit_amount: number;
  balance: number;
  source_account_code?: string;
  source_account_name?: string;
  reference?: string | null;
}

export interface LedgerPdfAccount {
  account_code: string;
  account_name: string;
  previousBalance: number;
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
  isConsolidated: boolean;
  entries: LedgerPdfEntry[];
}

export interface LedgerPdfFolioOptions {
  includeFolio: boolean;
  startingFolio: number;
}

export interface LedgerPdfAuthorizationLegend {
  number: string;
  date: string;
}

export interface LegalLedgerPdfInput {
  enterpriseName: string;
  periodStart: string; // ISO yyyy-mm-dd
  periodEnd: string;
  ledgers: LedgerPdfAccount[];
  descriptionMode?: LedgerDescriptionMode;
  folioOptions?: LedgerPdfFolioOptions;
  authorizationLegend?: LedgerPdfAuthorizationLegend;
}

const SHORT_DESC_LEN = 90;
const REF_REGEX = /(?:^|[\s|;,(\[])\s*(?:Ref(?:erencia)?\.?|REF)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9\-_./]*)/i;

function extractReference(raw: string | null | undefined): { ref: string; description: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ref: "", description: "" };
  const m = text.match(REF_REGEX);
  if (!m) return { ref: "", description: text };
  const ref = m[1];
  const cleaned = text
    .replace(m[0], " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;|.-]+|[\s,;|.-]+$/g, "")
    .trim();
  return { ref, description: cleaned };
}

function shorten(text: string, mode: LedgerDescriptionMode): string {
  if (!text) return "";
  if (mode === "none") return "";
  if (mode === "short" && text.length > SHORT_DESC_LEN) {
    return text.slice(0, SHORT_DESC_LEN - 1).trimEnd() + "…";
  }
  return text;
}

function formatIsoDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function renderLegalLedgerPdf(input: LegalLedgerPdfInput): { doc: jsPDF; pageCount: number } {
  const {
    enterpriseName,
    periodStart,
    periodEnd,
    ledgers,
    descriptionMode = "full",
    folioOptions,
    authorizationLegend,
  } = input;

  const includeFolio = folioOptions?.includeFolio ?? false;
  const startingFolio = folioOptions?.startingFolio ?? 1;
  const showDescription = descriptionMode !== "none";

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentRight = pageWidth - marginX;

  const FONT = "helvetica";
  const BLACK: [number, number, number] = [0, 0, 0];

  const accountPageRanges: Array<{
    code: string;
    name: string;
    firstPage: number;
    lastPage: number;
  }> = [];

  // -- Global report header (page 1 only) -------------------------------------
  doc.setTextColor(...BLACK);
  doc.setFont(FONT, "bold");
  doc.setFontSize(12);
  doc.text(enterpriseName || "", marginX, 14);
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.text("Libro Mayor", marginX, 19);
  doc.setFontSize(9);
  doc.text(
    `Período: ${formatIsoDate(periodStart)} a ${formatIsoDate(periodEnd)}`,
    marginX,
    24,
  );

  let cursorY = 30;

  // Per-account summary header — prominent but plain.
  const drawAccountSummary = (acc: LedgerPdfAccount, startY: number): number => {
    let y = startY;

    // Top double rule
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, contentRight, y);
    doc.setLineWidth(0.15);
    doc.line(marginX, y + 0.7, contentRight, y + 0.7);
    y += 5;

    doc.setFont(FONT, "bold");
    doc.setFontSize(11);
    doc.text(`CUENTA: ${acc.account_code} - ${acc.account_name}`, marginX, y);
    y += 5;

    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.text(`Período: ${formatIsoDate(periodStart)} a ${formatIsoDate(periodEnd)}`, marginX, y);
    y += 6;

    // Two columns of labeled amounts (no grid, no boxes)
    const labelX1 = marginX + 2;
    const valueX1 = marginX + 60;
    const labelX2 = pageWidth / 2 + 10;
    const valueX2 = contentRight;
    doc.setFontSize(9);

    doc.text("Saldo Inicial:", labelX1, y);
    doc.text(formatCurrency(acc.previousBalance), valueX1, y, { align: "right" });
    doc.text("Total Débitos:", labelX2, y);
    doc.text(formatCurrency(acc.totalDebit), valueX2, y, { align: "right" });
    y += 5;

    doc.text("Total Créditos:", labelX1, y);
    doc.text(formatCurrency(acc.totalCredit), valueX1, y, { align: "right" });
    doc.text("Saldo Final:", labelX2, y);
    doc.text(formatCurrency(acc.finalBalance), valueX2, y, { align: "right" });
    y += 6;

    return y;
  };

  // Totals block: horizontal rules only, no boxes.
  const drawAccountTotals = (acc: LedgerPdfAccount, startY: number): number => {
    let y = startY + 1;
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.2);
    doc.line(marginX, y, contentRight, y);
    y += 4;
    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.text("Sumas:", marginX, y);
    doc.text(formatCurrency(acc.totalDebit), contentRight - 44, y, { align: "right" });
    doc.text(formatCurrency(acc.totalCredit), contentRight - 22, y, { align: "right" });
    y += 5;
    doc.text("Saldo Final:", marginX, y);
    doc.text(formatCurrency(acc.finalBalance), contentRight, y, { align: "right" });
    y += 1.5;
    doc.setLineWidth(0.5);
    doc.line(marginX, y, contentRight, y);
    doc.setLineWidth(0.15);
    doc.line(marginX, y + 0.7, contentRight, y + 0.7);
    return y + 5;
  };

  // -- Iterate accounts --------------------------------------------------------
  ledgers.forEach((acc, idx) => {
    if (cursorY > pageHeight - 60) {
      doc.addPage();
      cursorY = 18;
    } else if (idx > 0) {
      cursorY += 2;
    }

    cursorY = drawAccountSummary(acc, cursorY);

    // Build table rows
    const head: string[] = ["Fecha", "Partida"];
    if (acc.isConsolidated) head.push("Cuenta Origen");
    head.push("Ref.");
    if (showDescription) head.push("Descripción");
    head.push("Debe", "Haber", "Saldo");

    const body = acc.entries.map((e) => {
      const { ref, description } = extractReference(e.description);
      const row: string[] = [
        formatIsoDate(e.entry_date),
        e.entry_number ?? "",
      ];
      if (acc.isConsolidated) {
        const code = e.source_account_code ?? "";
        const name = e.source_account_name ?? "";
        row.push(name ? `${code}\n${name}` : code);
      }
      row.push(ref);
      if (showDescription) row.push(shorten(description, descriptionMode));
      row.push(
        e.debit_amount > 0 ? formatCurrency(e.debit_amount) : "",
        e.credit_amount > 0 ? formatCurrency(e.credit_amount) : "",
        formatCurrency(e.balance),
      );
      return row;
    });

    // Column widths (Letter portrait ≈ 188mm content).
    const widths: number[] = [];
    widths.push(18); // Fecha
    widths.push(20); // Partida
    if (acc.isConsolidated) widths.push(26); // Cuenta Origen
    widths.push(18); // Ref
    const fixed = widths.reduce((s, w) => s + w, 0);
    const tailWidth = 22 * 3;
    const remaining = pageWidth - marginX * 2 - fixed - tailWidth;
    if (showDescription) widths.push(Math.max(remaining, 40));
    widths.push(22, 22, 22);

    const columnStyles: Record<number, any> = {};
    widths.forEach((w, i) => {
      const isAmount = i >= widths.length - 3;
      columnStyles[i] = {
        cellWidth: w,
        halign: isAmount ? "right" : "left",
        font: isAmount ? "courier" : FONT,
      };
    });

    const firstPage = doc.getNumberOfPages();
    autoTable(doc, {
      startY: cursorY,
      head: [head],
      body,
      theme: "plain",
      styles: {
        font: FONT,
        fontSize: 8,
        textColor: BLACK,
        lineWidth: 0,
        cellPadding: { top: 1.2, right: 2, bottom: 1.2, left: 0 },
        valign: "top",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: BLACK,
        fontStyle: "bold",
        lineColor: BLACK,
        // Only a bottom rule under the header — no boxes, no verticals.
        lineWidth: { top: 0, right: 0, bottom: 0.3, left: 0 } as any,
        halign: "left",
      },
      bodyStyles: { fillColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      columnStyles,
      margin: { left: marginX, right: marginX, top: 18, bottom: 18 },
    });

    const lastPage = doc.getNumberOfPages();
    const finalY = (doc as any).lastAutoTable.finalY ?? cursorY;

    accountPageRanges.push({
      code: acc.account_code,
      name: acc.account_name,
      firstPage,
      lastPage,
    });

    const neededForTotals = 22;
    if (finalY + neededForTotals > pageHeight - 18) {
      doc.addPage();
      accountPageRanges[accountPageRanges.length - 1].lastPage = doc.getNumberOfPages();
      cursorY = drawAccountTotals(acc, 18);
    } else {
      cursorY = drawAccountTotals(acc, finalY);
    }
  });

  // -- Post-process: page decorations -----------------------------------------
  const totalPages = doc.getNumberOfPages();

  const pageOwner = new Map<number, { code: string; name: string; firstPage: number; lastPage: number }>();
  for (const range of accountPageRanges) {
    for (let p = range.firstPage; p <= range.lastPage; p++) {
      pageOwner.set(p, range);
    }
  }

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setTextColor(...BLACK);

    const owner = pageOwner.get(p);
    // Continuation header (only on pages AFTER the account's first page).
    if (owner && p > owner.firstPage) {
      doc.setFont(FONT, "italic");
      doc.setFontSize(8);
      doc.text(
        `Continuación de la cuenta: ${owner.code} - ${owner.name}`,
        marginX,
        12,
      );
    }

    // Continuation footer — NEVER on the last page of the account.
    if (owner && p < owner.lastPage) {
      doc.setFont(FONT, "italic");
      doc.setFontSize(8);
      doc.text("Continúa en la siguiente página…", contentRight, pageHeight - 10, {
        align: "right",
      });
    }

    if (authorizationLegend) {
      doc.setFont(FONT, "normal");
      doc.setFontSize(7);
      doc.text(
        `Autorización: ${authorizationLegend.number} — Fecha: ${authorizationLegend.date}`,
        marginX,
        pageHeight - 6,
      );
    }

    if (includeFolio) {
      const folio = startingFolio + p - 1;
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.text(`Folio: ${folio}`, contentRight, 10, { align: "right" });
    } else {
      doc.setFont(FONT, "normal");
      doc.setFontSize(8);
      doc.text(`Página ${p} de ${totalPages}`, contentRight, pageHeight - 6, {
        align: "right",
      });
    }
  }

  return { doc, pageCount: totalPages };
}

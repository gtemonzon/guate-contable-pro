/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Legal General Ledger (Libro Mayor) PDF renderer.
 *
 * Goals:
 *  - Monochrome, low-toner, audit-grade format.
 *  - One self-contained block per account: summary header → movements table → totals.
 *  - Smart continuation: "Continúa en la siguiente página…" / "Continuación de la
 *    cuenta:" are stamped only when an account ACTUALLY spans multiple pages
 *    (post-processed against real rendered page ranges; no row-height guessing).
 *  - Reference column extracted out of the description.
 *  - Optional description modes: full | short | none.
 *  - Page numbering "Página X de Y" or authorized folios — never both.
 *
 * Future-friendly: this file is the "Legal Ledger Format". Add new formats
 * (audit / management) as sibling exports without touching this one.
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

/** Pull "Ref: 1234" (and variants) out of the description, return { ref, cleaned }. */
function extractReference(raw: string | null | undefined): { ref: string; description: string } {
  const text = (raw ?? "").trim();
  if (!text) return { ref: "", description: "" };
  const m = text.match(REF_REGEX);
  if (!m) return { ref: "", description: text };
  const ref = m[1];
  // Remove the whole "Ref: xxxxx" fragment from the description.
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

/**
 * Render the legal-format Libro Mayor PDF and return jsPDF + page count.
 * Caller is responsible for `.save()` (so caller can also inspect/decorate).
 */
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
  const GRAY_LINE: [number, number, number] = [120, 120, 120];

  // Per-account continuation ranges, filled while rendering. We post-process at
  // the end to stamp "Continúa..." / "Continuación de la cuenta..." messages.
  const accountPageRanges: Array<{
    code: string;
    name: string;
    firstPage: number;
    lastPage: number;
  }> = [];

  // -- Global report header (printed once at top of page 1) --------------------
  doc.setTextColor(...BLACK);
  doc.setFont(FONT, "bold");
  doc.setFontSize(13);
  doc.text(enterpriseName || "", marginX, 14);
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.text("Libro Mayor (Formato Legal)", marginX, 20);
  doc.setFontSize(9);
  doc.text(
    `Período: ${formatIsoDate(periodStart)} a ${formatIsoDate(periodEnd)}`,
    marginX,
    25,
  );

  let cursorY = 32;

  // Draw the per-account summary block. Returns the Y where the table can start.
  const drawAccountSummary = (acc: LedgerPdfAccount, startY: number): number => {
    let y = startY;

    // Top double rule
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, contentRight, y);
    doc.setLineWidth(0.2);
    doc.line(marginX, y + 0.8, contentRight, y + 0.8);
    y += 5;

    doc.setFont(FONT, "bold");
    doc.setFontSize(11);
    doc.text(`CUENTA: ${acc.account_code} - ${acc.account_name}`, marginX, y);
    y += 5;

    doc.setFont(FONT, "normal");
    doc.setFontSize(9);
    doc.text(`Período: ${formatIsoDate(periodStart)} a ${formatIsoDate(periodEnd)}`, marginX, y);
    if (acc.isConsolidated) {
      doc.text(
        "Saldo consolidado de todas las cuentas hijas",
        contentRight,
        y,
        { align: "right" },
      );
    }
    y += 6;

    // 2-column summary table
    const labelX = marginX + 2;
    const valueX = marginX + 70;
    const labelX2 = pageWidth / 2 + 10;
    const valueX2 = contentRight;
    doc.setFontSize(9);

    doc.setFont(FONT, "normal");
    doc.text("Saldo inicial:", labelX, y);
    doc.text("Total débitos:", labelX2, y);
    doc.setFont(FONT, "bold");
    doc.text(formatCurrency(acc.previousBalance), valueX, y, { align: "right" });
    doc.text(formatCurrency(acc.totalDebit), valueX2, y, { align: "right" });
    y += 5;

    doc.setFont(FONT, "normal");
    doc.text("Total créditos:", labelX, y);
    doc.text("Saldo final:", labelX2, y);
    doc.setFont(FONT, "bold");
    doc.text(formatCurrency(acc.totalCredit), valueX, y, { align: "right" });
    doc.text(formatCurrency(acc.finalBalance), valueX2, y, { align: "right" });
    y += 5;

    // Bottom rule
    doc.setFont(FONT, "normal");
    doc.setLineWidth(0.2);
    doc.line(marginX, y, contentRight, y);
    y += 3;

    return y;
  };

  // Draw the totals block at the end of an account
  const drawAccountTotals = (acc: LedgerPdfAccount, startY: number): number => {
    let y = startY + 2;
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.2);
    doc.line(pageWidth / 2, y, contentRight, y);
    y += 4;
    doc.setFontSize(9);
    doc.setFont(FONT, "normal");
    doc.text("TOTAL DÉBITOS:", pageWidth / 2 + 5, y);
    doc.setFont(FONT, "bold");
    doc.text(formatCurrency(acc.totalDebit), contentRight, y, { align: "right" });
    y += 5;
    doc.setFont(FONT, "normal");
    doc.text("TOTAL CRÉDITOS:", pageWidth / 2 + 5, y);
    doc.setFont(FONT, "bold");
    doc.text(formatCurrency(acc.totalCredit), contentRight, y, { align: "right" });
    y += 2;
    doc.setLineWidth(0.2);
    doc.line(pageWidth / 2, y, contentRight, y);
    doc.line(pageWidth / 2, y + 0.6, contentRight, y + 0.6);
    y += 5;
    doc.setFont(FONT, "bold");
    doc.setFontSize(10);
    doc.text("SALDO FINAL:", pageWidth / 2 + 5, y);
    doc.text(formatCurrency(acc.finalBalance), contentRight, y, { align: "right" });
    y += 2;
    doc.setLineWidth(0.6);
    doc.line(pageWidth / 2, y, contentRight, y);
    doc.setLineWidth(0.2);
    doc.line(pageWidth / 2, y + 0.8, contentRight, y + 0.8);
    return y + 4;
  };

  // -- Iterate accounts --------------------------------------------------------
  ledgers.forEach((acc, idx) => {
    // Need at least ~50mm for the summary block + first rows. If not enough,
    // page-break before rendering.
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

    // Column widths (in mm). Total content width ≈ 188mm on Letter portrait.
    const widths: number[] = [];
    widths.push(18); // Fecha
    widths.push(20); // Partida
    if (acc.isConsolidated) widths.push(26); // Cuenta Origen
    widths.push(18); // Ref
    const fixed = widths.reduce((s, w) => s + w, 0);
    const tailWidth = 22 * 3; // Debe + Haber + Saldo
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
        lineColor: GRAY_LINE,
        lineWidth: 0.1,
        cellPadding: 1.4,
        valign: "top",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: BLACK,
        fontStyle: "bold",
        lineColor: BLACK,
        lineWidth: 0.3,
        halign: "left",
      },
      bodyStyles: {
        fillColor: [255, 255, 255],
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles,
      margin: { left: marginX, right: marginX, top: 18, bottom: 18 },
      // Repeat the table header on continuation pages (default).
    });

    const lastPage = doc.getNumberOfPages();
    const finalY = (doc as any).lastAutoTable.finalY ?? cursorY;

    accountPageRanges.push({
      code: acc.account_code,
      name: acc.account_name,
      firstPage,
      lastPage,
    });

    // Totals: keep them attached to the table. If they don't fit on the last
    // page, push them to a new page (still tied to this account visually).
    const neededForTotals = 28;
    if (finalY + neededForTotals > pageHeight - 18) {
      doc.addPage();
      // The freshly added page belongs to this account's continuation range.
      accountPageRanges[accountPageRanges.length - 1].lastPage = doc.getNumberOfPages();
      cursorY = drawAccountTotals(acc, 18);
    } else {
      cursorY = drawAccountTotals(acc, finalY);
    }
  });

  // -- Post-process: stamp page decorations -----------------------------------
  const totalPages = doc.getNumberOfPages();

  // Index pages → owning account (the last account whose range includes the page)
  const pageOwner = new Map<number, { code: string; name: string; firstPage: number; lastPage: number }>();
  for (const range of accountPageRanges) {
    for (let p = range.firstPage; p <= range.lastPage; p++) {
      pageOwner.set(p, range);
    }
  }

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setTextColor(...BLACK);

    // Continuation header (top): only when this page is NOT the account's first page.
    const owner = pageOwner.get(p);
    if (owner && p > owner.firstPage) {
      doc.setFont(FONT, "italic");
      doc.setFontSize(8);
      doc.text(
        `Continuación de la cuenta: ${owner.code} - ${owner.name}`,
        marginX,
        12,
      );
      doc.setDrawColor(...GRAY_LINE);
      doc.setLineWidth(0.1);
      doc.line(marginX, 13.5, contentRight, 13.5);
    }

    // Continuation footer (bottom): only when this account truly spills to next page.
    if (owner && p < owner.lastPage) {
      doc.setFont(FONT, "italic");
      doc.setFontSize(8);
      doc.text("Continúa en la siguiente página…", contentRight, pageHeight - 10, {
        align: "right",
      });
    }

    // Authorization legend (bottom-left)
    if (authorizationLegend) {
      doc.setFont(FONT, "normal");
      doc.setFontSize(7);
      doc.text(
        `Autorización: ${authorizationLegend.number} — Fecha: ${authorizationLegend.date}`,
        marginX,
        pageHeight - 6,
      );
    }

    // Folios vs page numbers — never both.
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

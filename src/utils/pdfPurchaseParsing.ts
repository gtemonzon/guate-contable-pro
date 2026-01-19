// PDF Purchase Parsing Utilities for SAT Guatemala format
// Used to extract purchase data from PDF exports of "Mis Documentos > Recibidos"

import {
  normalizeHeader,
  parseDateFlexible,
  parseNumber,
  calculateVATFromTotal,
} from "./satImportMapping";

export interface ParsedPurchaseRow {
  invoice_date: string;
  invoice_series: string;
  invoice_number: string;
  fel_document_type: string;
  supplier_nit: string;
  supplier_name: string;
  total_amount: number;
  vat_amount: number;
  base_amount: number;
  is_anulado: boolean;
}

export interface PdfParseResult {
  rows: ParsedPurchaseRow[];
  errors: string[];
  receiverNit?: string;
}

// Common SAT PDF header patterns for purchases
const PDF_HEADER_PATTERNS = [
  /fecha\s*de\s*emisi[oó]n/i,
  /nit\s*del\s*emisor/i,
  /nombre\s*completo\s*del\s*emisor/i,
  /tipo\s*de\s*d[ot]e/i,
  /n[uú]mero\s*del\s*d[ot]e/i,
  /gran\s*total/i,
];

// Regex patterns for extracting data from PDF text
const DATE_PATTERN = /(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}(?:T[\d:]+)?)/g;
const NIT_PATTERN = /\b(\d{6,10}(?:-?\d)?)\b/g;
const AMOUNT_PATTERN = /Q?\s*([\d,]+\.\d{2})\b/g;
const DOCUMENT_TYPE_PATTERN = /\b(FACT|FCAM|NCRE|NDEB|FESP|FPEQ|NABN|RDON|RECI)\b/gi;

/**
 * Detect if text appears to be from a SAT purchases PDF
 */
export function isSATPurchasesPdfFormat(text: string): boolean {
  const normalizedText = text.toLowerCase();
  let matchCount = 0;
  
  for (const pattern of PDF_HEADER_PATTERNS) {
    if (pattern.test(normalizedText)) {
      matchCount++;
    }
  }
  
  // Also check for specific SAT markers
  if (normalizedText.includes("agencia virtual") || normalizedText.includes("sat guatemala")) {
    matchCount++;
  }
  
  return matchCount >= 2;
}

/**
 * Extract receiver NIT from PDF text (to validate it matches the enterprise)
 */
export function extractReceiverNit(text: string): string | null {
  // Look for "ID del Receptor" or "NIT del Receptor" patterns
  const receiverPatterns = [
    /id\s*del\s*receptor\s*[:\s]*(\d{6,10}(?:-?\d)?)/i,
    /nit\s*del\s*receptor\s*[:\s]*(\d{6,10}(?:-?\d)?)/i,
  ];
  
  for (const pattern of receiverPatterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace(/-/g, "");
    }
  }
  
  return null;
}

/**
 * Parse structured rows from PDF text
 * This handles the tabular format in SAT exports
 */
export function parsePdfRowsFromText(text: string): PdfParseResult {
  const rows: ParsedPurchaseRow[] = [];
  const errors: string[] = [];
  
  // Extract receiver NIT for validation
  const receiverNit = extractReceiverNit(text);
  
  // Split text into lines
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  
  // Find header row
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (
      (line.includes("fecha") && line.includes("emisi")) ||
      (line.includes("nit") && line.includes("emisor")) ||
      (line.includes("tipo") && line.includes("dte"))
    ) {
      headerIndex = i;
      break;
    }
  }
  
  if (headerIndex === -1) {
    // Try to detect tabular data without clear header
    return parseUnstructuredPdfText(text, receiverNit);
  }
  
  // Process lines after header
  let currentRow: Partial<ParsedPurchaseRow> = {};
  let rowBuffer: string[] = [];
  
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines and page footers
    if (!line || line.match(/^p[aá]gina\s+\d+/i) || line.match(/^total\s*:/i)) {
      continue;
    }
    
    // Try to detect row start (usually begins with a date)
    const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
    
    if (dateMatch) {
      // If we have a previous row, process it
      if (rowBuffer.length > 0) {
        const parsedRow = parseBufferedRow(rowBuffer.join(" "));
        if (parsedRow) {
          rows.push(parsedRow);
        }
      }
      // Start new row
      rowBuffer = [line];
    } else if (rowBuffer.length > 0) {
      // Continue current row
      rowBuffer.push(line);
    }
  }
  
  // Process last row
  if (rowBuffer.length > 0) {
    const parsedRow = parseBufferedRow(rowBuffer.join(" "));
    if (parsedRow) {
      rows.push(parsedRow);
    }
  }
  
  return { rows, errors, receiverNit: receiverNit || undefined };
}

/**
 * Parse a single buffered row text into a purchase record
 */
function parseBufferedRow(rowText: string): ParsedPurchaseRow | null {
  // Extract date (should be at start)
  const dateMatch = rowText.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (!dateMatch) return null;
  
  const parsedDate = parseDateFlexible(dateMatch[1]);
  if (!parsedDate) return null;
  
  // Extract NIT (8-10 digit number, possibly with check digit)
  const nitMatches = rowText.match(/\b(\d{6,10}(?:-?\d)?)\b/g);
  const supplierNit = nitMatches && nitMatches.length > 0 ? nitMatches[0].replace(/-/g, "") : "";
  
  // Extract document type
  const docTypeMatch = rowText.match(/\b(FACT|FCAM|NCRE|NDEB|FESP|FPEQ|NABN|RDON|RECI)\b/i);
  const docType = docTypeMatch ? docTypeMatch[1].toUpperCase() : "FACT";
  
  // Extract amounts (look for numbers with decimals)
  const amountMatches = rowText.match(/(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/g);
  let total = 0;
  let vat = 0;
  
  if (amountMatches && amountMatches.length > 0) {
    // Last amount is usually the total
    total = parseNumber(amountMatches[amountMatches.length - 1]);
    // Second to last might be VAT if there are multiple amounts
    if (amountMatches.length >= 2) {
      vat = parseNumber(amountMatches[amountMatches.length - 2]);
    }
  }
  
  // Calculate VAT from total if not extracted or seems wrong
  const { vatAmount, baseAmount } = calculateVATFromTotal(total, docType);
  
  // Extract invoice number (look for sequence after document type or serie)
  const invoiceNumMatch = rowText.match(/(?:serie\s*)?([A-Z0-9]{0,4})\s*-?\s*(\d{4,12})/i);
  const invoiceSeries = invoiceNumMatch ? invoiceNumMatch[1] || "" : "";
  const invoiceNumber = invoiceNumMatch ? invoiceNumMatch[2] : "";
  
  // Extract supplier name (usually the longest text segment after NIT)
  // This is tricky - we'll take text between NIT and amounts
  let supplierName = "";
  const afterNit = rowText.split(supplierNit)[1] || "";
  const nameMatch = afterNit.match(/^\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s.,&'-]{5,80})/);
  if (nameMatch) {
    supplierName = nameMatch[1].trim();
  }
  
  // Check if anulado
  const isAnulado = /\b(anulado|anulada|anulo)\b/i.test(rowText) ||
                    /\bS\s*$/i.test(rowText);
  
  return {
    invoice_date: parsedDate,
    invoice_series: invoiceSeries,
    invoice_number: invoiceNumber,
    fel_document_type: docType,
    supplier_nit: supplierNit,
    supplier_name: supplierName,
    total_amount: total,
    vat_amount: vatAmount,
    base_amount: baseAmount,
    is_anulado: isAnulado,
  };
}

/**
 * Fallback parser for unstructured PDF text
 */
function parseUnstructuredPdfText(text: string, receiverNit: string | null): PdfParseResult {
  const rows: ParsedPurchaseRow[] = [];
  const errors: string[] = [];
  
  // Split by potential row delimiters
  const segments = text.split(/(?=\d{1,2}\/\d{1,2}\/\d{4})/);
  
  for (const segment of segments) {
    if (!segment.trim()) continue;
    
    const parsed = parseBufferedRow(segment);
    if (parsed && parsed.invoice_number && parsed.total_amount > 0) {
      rows.push(parsed);
    }
  }
  
  if (rows.length === 0) {
    errors.push("No se pudieron extraer registros del PDF. El formato puede no ser compatible.");
  }
  
  return { rows, errors, receiverNit: receiverNit || undefined };
}

/**
 * Clean and normalize PDF text before parsing
 */
export function cleanPdfText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, " ")
    // Remove page numbers
    .replace(/\bP[aá]gina\s+\d+\s+de\s+\d+\b/gi, "")
    // Remove common header/footer text
    .replace(/Agencia Virtual SAT/gi, "")
    .replace(/Superintendencia de Administraci[oó]n Tributaria/gi, "")
    // Normalize line breaks around dates
    .replace(/(\d{1,2}\/\d{1,2}\/\d{4})/g, "\n$1")
    .trim();
}

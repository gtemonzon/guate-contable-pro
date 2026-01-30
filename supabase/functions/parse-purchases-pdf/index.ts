// Edge function to parse PDF text for purchase imports
// Supports SAT Guatemala formats: "Mis Documentos > Recibidos" and "Libro de Compras"

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedPurchaseRow {
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

interface ParseResult {
  rows: ParsedPurchaseRow[];
  errors: string[];
  receiverNit?: string;
  isSatFormat: boolean;
  formatType?: string;
}

// Parse date flexibly (DD/MM/YYYY, YYYY-MM-DD, ISO 8601)
function parseDateFlexible(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  
  // ISO 8601 with time
  const iso8601 = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso8601) {
    const [, year, month, day] = iso8601;
    return `${year}-${month}-${day}`;
  }
  
  // DD/MM/YYYY
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  return null;
}

// Parse number from SAT format (handles Q1,234.56 or 1234.56)
function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  
  let cleaned = value.trim().replace(/[Q$€\s]/g, "");
  
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(",", "");
    }
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// FEL document types that do NOT generate VAT
const NO_VAT_DOCUMENT_TYPES = ["FPEQ", "FESP", "NABN", "RDON", "RECI"];

// Calculate VAT from total amount based on document type
function calculateVATFromTotal(
  totalAmount: number,
  documentType: string,
  vatRate: number = 0.12
): { vatAmount: number; baseAmount: number } {
  const docType = (documentType || "FACT").toUpperCase().trim();
  
  if (NO_VAT_DOCUMENT_TYPES.includes(docType)) {
    return { vatAmount: 0, baseAmount: totalAmount };
  }
  
  const baseAmount = Math.round((totalAmount / (1 + vatRate)) * 100) / 100;
  const vatAmount = Math.round((totalAmount - baseAmount) * 100) / 100;
  
  return { vatAmount, baseAmount };
}

// Detect PDF format type
function detectPdfFormat(text: string): { isSatFormat: boolean; formatType: string } {
  const normalizedText = text.toLowerCase();
  
  // Check for "Libro de Compras" format
  if (
    normalizedText.includes("libro de compras") ||
    (normalizedText.includes("compras adquiridas") && normalizedText.includes("servicios adquiridos")) ||
    (normalizedText.includes("folio no") && normalizedText.includes("período"))
  ) {
    return { isSatFormat: true, formatType: "libro_compras" };
  }
  
  // Check for "Mis Documentos > Recibidos" format
  const receivedDocsPatterns = [
    /fecha\s*de\s*emisi[oó]n/i,
    /nit\s*del\s*emisor/i,
    /nombre\s*completo\s*del\s*emisor/i,
    /tipo\s*de\s*d[ot]e/i,
    /n[uú]mero\s*del\s*d[ot]e/i,
    /gran\s*total/i,
  ];
  
  let matchCount = 0;
  for (const pattern of receivedDocsPatterns) {
    if (pattern.test(normalizedText)) matchCount++;
  }
  
  if (normalizedText.includes("agencia virtual") || normalizedText.includes("sat guatemala")) {
    matchCount++;
  }
  
  if (matchCount >= 2) {
    return { isSatFormat: true, formatType: "mis_documentos" };
  }
  
  return { isSatFormat: false, formatType: "unknown" };
}

// Extract NIT from PDF text (receiver/owner)
function extractNitFromPdf(text: string): string | null {
  // Look for NIT patterns
  const patterns = [
    /nit\s*:\s*(\d{6,10}(?:-?\d)?)/i,
    /id\s*del\s*receptor\s*[:\s]*(\d{6,10}(?:-?\d)?)/i,
    /nit\s*del\s*receptor\s*[:\s]*(\d{6,10}(?:-?\d)?)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].replace(/-/g, "");
  }
  
  return null;
}

// Parse "Libro de Compras" format - SAT report table flattened into text
function parseLibroComprasFormat(text: string): ParsedPurchaseRow[] {
  const rows: ParsedPurchaseRow[] = [];

  // The client-side PDF text extraction often flattens the table into a single long line.
  // Normalize whitespace (including NBSP variants) and force a line break before each row
  // using a safer delimiter: start-of-text OR a non-digit char before the row number.
  const normalized = text
    .replace(/\r/g, "")
    .replace(/[\s\u00A0\u202F]+/g, " ")
    .replace(/(^|[^\d])(\d{1,3})\s+(\d{1,2}\/\d{1,2}\/\d{4})/g, "$1\n$2 $3")
    .trim();

  const lines = normalized
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  console.log(`Libro de Compras: Processing ${lines.length} normalized lines`);

  for (const line of lines) {
    // Skip headers / totals
    const lower = line.toLowerCase();
    if (lower.includes("precio neto") && lower.includes("no.") && lower.includes("fecha")) continue;
    if (lower.startsWith("libro de compras")) continue;
    if (lower.startsWith("total compras")) continue;
    if (lower.startsWith("total valor")) continue;
    if (lower.startsWith("nit:")) continue;
    if (lower.startsWith("periodo:") || lower.startsWith("período:")) continue;
    if (lower.startsWith("folio")) continue;

    // Row should start with: <no> <fecha>
    const startMatch = line.match(/^(\d{1,3})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+/);
    if (!startMatch) continue;

    const rowNum = startMatch[1];
    const fecha = startMatch[2];

    const parsedDate = parseDateFlexible(fecha);
    if (!parsedDate) continue;

    // Extract amounts (Qxx.xx). In the report, the last is Total and the penultimate is IVA Crédito.
    const amountMatches = line.match(/Q\s*[\d,]+\.\d{2}/g) ?? [];
    const numericAmounts = amountMatches.map((a) => parseNumber(a));
    const total = numericAmounts.length > 0 ? numericAmounts[numericAmounts.length - 1] : 0;
    const ivaCredit = numericAmounts.length > 1 ? numericAmounts[numericAmounts.length - 2] : 0;

    if (total <= 0) continue;

    // After the date we expect: Tipo Serie NoDoc Estado NIT Nombre ... amounts
    // We'll parse tokens up to NIT, then capture name until first 'Q'.
    const afterDate = line.replace(/^\d{1,3}\s+\d{1,2}\/\d{1,2}\/\d{4}\s+/, "");

    const tokens = afterDate.split(/\s+/);
    if (tokens.length < 6) continue;

    const tipo = (tokens[0] || "FACT").toUpperCase();
    const serie = tokens[1] || "";
    const numDoc = tokens[2] || "";
    const estado = tokens[3] || "";
    const nit = (tokens[4] || "").replace(/-/g, "");

    // Name: substring between NIT and first amount token (Q...)
    let supplierName = "";
    const firstAmountIdx = line.indexOf("Q");
    if (firstAmountIdx !== -1 && nit) {
      const nitPos = line.indexOf(nit);
      if (nitPos !== -1) {
        supplierName = line
          .slice(nitPos + nit.length, firstAmountIdx)
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    // Determine VAT/base.
    let vatAmount: number;
    let baseAmount: number;

    if (ivaCredit > 0 && ivaCredit < total) {
      vatAmount = ivaCredit;
      baseAmount = Math.round((total - vatAmount) * 100) / 100;
    } else {
      const calculated = calculateVATFromTotal(total, tipo);
      vatAmount = calculated.vatAmount;
      baseAmount = calculated.baseAmount;
    }

    const isAnulado = estado.toLowerCase().includes("anulado") || /\b(anulado|anulada)\b/i.test(line);

    // Basic sanity: require invoice number
    if (!numDoc) continue;

    rows.push({
      invoice_date: parsedDate,
      invoice_series: serie,
      invoice_number: numDoc,
      fel_document_type: tipo,
      supplier_nit: nit,
      supplier_name: supplierName,
      total_amount: total,
      vat_amount: vatAmount,
      base_amount: baseAmount,
      is_anulado: isAnulado,
    });
  }

  return rows;
}

// Parse "Mis Documentos > Recibidos" format
function parseMisDocumentosFormat(text: string): ParsedPurchaseRow[] {
  const rows: ParsedPurchaseRow[] = [];
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  
  console.log(`Mis Documentos: Processing ${lines.length} lines`);
  
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
  
  // Process lines
  let rowBuffer: string[] = [];
  const startIndex = headerIndex > 0 ? headerIndex + 1 : 0;
  
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    
    if (!line || line.match(/^p[aá]gina\s+\d+/i) || line.match(/^total\s*:/i)) {
      continue;
    }
    
    const dateMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{4})/);
    
    if (dateMatch) {
      if (rowBuffer.length > 0) {
        const parsedRow = parseBufferedRow(rowBuffer.join(" "));
        if (parsedRow && parsedRow.invoice_number && parsedRow.total_amount > 0) {
          rows.push(parsedRow);
        }
      }
      rowBuffer = [line];
    } else if (rowBuffer.length > 0) {
      rowBuffer.push(line);
    }
  }
  
  if (rowBuffer.length > 0) {
    const parsedRow = parseBufferedRow(rowBuffer.join(" "));
    if (parsedRow && parsedRow.invoice_number && parsedRow.total_amount > 0) {
      rows.push(parsedRow);
    }
  }
  
  return rows;
}

// Parse a buffered row text into a purchase record
function parseBufferedRow(rowText: string): ParsedPurchaseRow | null {
  const dateMatch = rowText.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (!dateMatch) return null;
  
  const parsedDate = parseDateFlexible(dateMatch[1]);
  if (!parsedDate) return null;
  
  const nitMatches = rowText.match(/\b(\d{6,10}(?:-?\d)?)\b/g);
  const supplierNit = nitMatches && nitMatches.length > 0 ? nitMatches[0].replace(/-/g, "") : "";
  
  const docTypeMatch = rowText.match(/\b(FACT|FCAM|NCRE|NDEB|FESP|FPEQ|NABN|RDON|RECI)\b/i);
  const docType = docTypeMatch ? docTypeMatch[1].toUpperCase() : "FACT";
  
  const amountMatches = rowText.match(/(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/g);
  let total = 0;
  
  if (amountMatches && amountMatches.length > 0) {
    total = parseNumber(amountMatches[amountMatches.length - 1]);
  }
  
  const { vatAmount, baseAmount } = calculateVATFromTotal(total, docType);
  
  const invoiceNumMatch = rowText.match(/(?:serie\s*)?([A-Z0-9]{0,4})\s*-?\s*(\d{4,12})/i);
  const invoiceSeries = invoiceNumMatch ? invoiceNumMatch[1] || "" : "";
  const invoiceNumber = invoiceNumMatch ? invoiceNumMatch[2] : "";
  
  let supplierName = "";
  if (supplierNit) {
    const afterNit = rowText.split(supplierNit)[1] || "";
    const nameMatch = afterNit.match(/^\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s.,&'-]{5,80})/);
    if (nameMatch) {
      supplierName = nameMatch[1].trim();
    }
  }
  
  const isAnulado = /\b(anulado|anulada|anulo)\b/i.test(rowText) || /\bS\s*$/i.test(rowText);
  
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

// Main parsing function
function parsePdfText(text: string): ParseResult {
  const errors: string[] = [];
  
  const { isSatFormat, formatType } = detectPdfFormat(text);
  const receiverNit = extractNitFromPdf(text);
  
  console.log(`Detected format: ${formatType}, isSatFormat: ${isSatFormat}`);
  console.log(`Text length: ${text.length} chars`);
  
  if (!isSatFormat) {
    console.log("PDF does not appear to be in SAT format");
    errors.push("El formato del PDF no parece ser un reporte de SAT Guatemala");
  }
  
  let rows: ParsedPurchaseRow[] = [];
  
  if (formatType === "libro_compras") {
    rows = parseLibroComprasFormat(text);
  } else if (formatType === "mis_documentos") {
    rows = parseMisDocumentosFormat(text);
  } else {
    // Try both formats and use the one that extracts more rows
    const libroRows = parseLibroComprasFormat(text);
    const docsRows = parseMisDocumentosFormat(text);
    
    console.log(`Libro format: ${libroRows.length} rows, Docs format: ${docsRows.length} rows`);
    
    rows = libroRows.length >= docsRows.length ? libroRows : docsRows;
  }
  
  console.log(`Parsed ${rows.length} rows from PDF`);
  
  if (rows.length === 0) {
    errors.push("No se pudieron extraer registros del PDF. Verifique que el archivo sea un reporte de compras de SAT.");
  }
  
  return {
    rows,
    errors,
    receiverNit: receiverNit || undefined,
    isSatFormat,
    formatType,
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Validate authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    
    const token = authHeader.replace("Bearer ", "");
    const { data, error } = await supabase.auth.getClaims(token);
    
    if (error || !data?.claims) {
      console.error("Auth error:", error);
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Parse request body
    const { pdfText, enterpriseNit } = await req.json();
    
    if (!pdfText || typeof pdfText !== "string") {
      return new Response(
        JSON.stringify({ error: "Se requiere el texto del PDF" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Input validation: limit text size to prevent DoS attacks (max 5MB)
    const MAX_PDF_TEXT_SIZE = 5 * 1024 * 1024; // 5MB
    if (pdfText.length > MAX_PDF_TEXT_SIZE) {
      console.warn(`PDF text exceeds size limit: ${pdfText.length} bytes`);
      return new Response(
        JSON.stringify({ error: "El texto del PDF excede el tamaño máximo permitido (5MB)" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Parsing PDF text (${pdfText.length} chars) for enterprise NIT: ${enterpriseNit}`);
    
    // Parse the PDF text
    const result = parsePdfText(pdfText);
    
    // Validate enterprise NIT if provided
    if (enterpriseNit && result.receiverNit) {
      const cleanEnterpriseNit = enterpriseNit.replace(/[-\s]/g, "");
      const cleanReceiverNit = result.receiverNit.replace(/[-\s]/g, "");
      
      if (cleanReceiverNit !== cleanEnterpriseNit) {
        result.errors.push(
          `El NIT del receptor en el PDF (${result.receiverNit}) no coincide con el NIT de la empresa activa (${enterpriseNit})`
        );
      }
    }
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (err: unknown) {
    console.error("Error parsing PDF:", err);
    const errorMessage = err instanceof Error ? err.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: `Error al procesar: ${errorMessage}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

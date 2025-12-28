import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map Spanish month names to numbers
const MONTH_MAP: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

interface ExtractedData {
  formNumber?: string;
  accessCode?: string;
  taxType?: string;
  periodType?: string;
  periodMonth?: number;
  periodYear?: number;
  paymentDate?: string;
  amountPaid?: number;
  fieldsFound: number;
}

function cleanNumber(str: string): string {
  return str.replace(/\s+/g, "").trim();
}

function onlyDigits(str: string): string {
  return str.replace(/\D+/g, "");
}

function normalizeLikelyFormNumber(digits: string): string {
  // SAT form numbers are typically 7, 8 or 11 digits depending on the form;
  // in our UI we usually expect 11 digits.
  let d = digits;

  // Common OCR artifact: trailing "4" from "4 de 4"
  if (d.length === 12 && d.endsWith("4")) d = d.slice(0, -1);

  // If it contains 11+ digits, prefer the first 11 (stable, avoids trailing artifacts)
  if (d.length > 11) d = d.slice(0, 11);

  return d;
}

function extractBetween(text: string, start: RegExp, end: RegExp): string | null {
  const startMatch = start.exec(text);
  if (!startMatch) return null;
  const slice = text.slice(startMatch.index + startMatch[0].length);
  const endMatch = end.exec(slice);
  const body = endMatch ? slice.slice(0, endMatch.index) : slice;
  return body.trim();
}

function parseDate(dateStr: string): string | null {
  // Try formats: dd/mm/yyyy or dd-mm-yyyy
  const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(amountStr: string): number | null {
  // Remove spaces, remove thousands separators
  const cleaned = amountStr.replace(/\s+/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractDataFromText(text: string): ExtractedData {
  const result: ExtractedData = { fieldsFound: 0 };
  
  console.log("Extracting data from text (first 1000 chars):", text.substring(0, 1000));
  
  // Extract Form Number (prefer extracting between headings to avoid the "4 de 4" artifact)
  const formBlock = extractBetween(
    text,
    /N[úu]mero\s+de\s+Formulario/i,
    /N[úu]mero\s+de\s+Acceso/i
  );
  if (formBlock) {
    const digits = normalizeLikelyFormNumber(onlyDigits(formBlock));
    if (digits.length >= 7) {
      result.formNumber = digits;
      result.fieldsFound++;
      console.log("Found formNumber (block):", result.formNumber);
    }
  }

  // Fallback regex patterns if block extraction failed
  if (!result.formNumber) {
    const formNumberPatterns = [
      /N[úu]mero\s+de\s+Formulario[:\s\|]*([\d\s]+)/i,
      /No\.?\s*de\s*Formulario[:\s\|]*([\d\s]+)/i,
      /Formulario\s+No\.?[:\s\|]*([\d\s]+)/i,
      /(\d{2}\s+\d{3}\s+\d{3}\s+\d{3})/i, // "49 078 843 961"
      /(\d{2}\s+\d{3}\s+\d{3})/i, // "49 078 669" (sometimes line breaks)
    ];

    for (const pattern of formNumberPatterns) {
      const match = text.match(pattern);
      if (match) {
        const digits = normalizeLikelyFormNumber(onlyDigits(match[1]));
        if (digits.length >= 7) {
          result.formNumber = digits;
          result.fieldsFound++;
          console.log("Found formNumber (regex):", result.formNumber);
          break;
        }
      }
    }
  }

  // Extract Access Code (prefer between headings)
  const accessBlock = extractBetween(
    text,
    /N[úu]mero\s+de\s+Acceso|C[óo]digo\s+de\s+Acceso/i,
    /Contingencia|NIT\s+DEL\s+CONTRIBUYENTE|PER[IÍ]ODO\s+DE\s+IMPOSICI[ÓO]N|R[ÉE]GIMEN/i
  );
  if (accessBlock) {
    // Prefer the first 9-digit grouped number after the label (e.g. "406 410 915")
    const grouped = accessBlock.match(/(\d{3}\s*\d{3}\s*\d{3})/);
    if (grouped) {
      result.accessCode = onlyDigits(grouped[1]);
    } else {
      const digits = onlyDigits(accessBlock);
      if (digits.length >= 9) {
        // If extra digits are present (e.g. SAT-2046 Release 1), take the last 9
        result.accessCode = digits.slice(-9);
      }
    }

    if (result.accessCode && result.accessCode.length === 9) {
      result.fieldsFound++;
      console.log("Found accessCode (block):", result.accessCode);
    } else {
      result.accessCode = undefined;
    }
  }

  // Fallback Access Code patterns
  if (!result.accessCode) {
    const accessCodePatterns = [
      /N[úu]mero\s+de\s+Acceso[:\s\|]*([\d\s]+)/i,
      /C[óo]digo\s+de\s+Acceso[:\s\|]*([\d\s]+)/i,
      /N[úu]mero\s+de\s+Acceso\s*\n\s*([\d\s]+)/i,
      /(\d{3}\s+\d{3}\s+\d{3})/i, // "406 410 915"
    ];

    for (const pattern of accessCodePatterns) {
      const match = text.match(pattern);
      if (match) {
        const digitsRaw = onlyDigits(match[1] ?? match[0]);
        if (digitsRaw.length >= 9) {
          result.accessCode = digitsRaw.slice(-9);
          result.fieldsFound++;
          console.log("Found accessCode (regex):", result.accessCode);
          break;
        }
      }
    }
  }

  // Extract Tax Type - ISR, IVA, ISO, etc.
  const taxTypePatterns = [
    /(ISR\s+(?:OPCI[ÓO]N(?:AL)?\s+)?(?:MENSUAL|TRIMESTRAL|ANUAL|ACTIVIDADES\s+LUCRATIVAS)?)/gi,
    /(IVA\s*(?:GENERAL)?)/gi,
    /(ISO\s*(?:TRIMESTRAL)?)/gi,
    /(IUSI)/gi,
    /(IETAAP)/gi,
    /Formulario\s+SAT[:\s]*(\d+)[:\s]*([A-Z\s]+)/i,
  ];
  
  for (const pattern of taxTypePatterns) {
    const match = text.match(pattern);
    if (match) {
      result.taxType = match[0].trim().toUpperCase();
      result.fieldsFound++;
      console.log("Found taxType:", result.taxType);
      break;
    }
  }

  // Extract period info (type + month/quarter + year)
  const periodBlock = extractBetween(
    text,
    /PER[IÍ]ODO\s+DE\s+IMPOSICI[ÓO]N/i,
    /RENTA|DETERMINACI[ÓO]N|DECLARACI[ÓO]N|VALID(?:E|ACI[ÓO]N)|FECHA\s+DE|TOTAL\s+A\s+PAGAR|N[ÚU]MERO\s+DE\s+FORMULARIO|N[ÚU]MERO\s+DE\s+ACCESO|C[ÓO]DIGO\s+DE\s+ACCESO/i
  );
  const periodText = (periodBlock || "").toUpperCase();

  // 1) Quarter (Trimestral)
  const quarterMatch = periodText.match(/TRIMESTRE\s*[:\-\|\s]*([1-4])\b/i);
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1]);
    result.periodType = "trimestral";
    result.periodMonth = (q - 1) * 3 + 1; // store starting month of quarter
    result.fieldsFound++;
    console.log("Found periodType:", result.periodType);
    console.log("Found periodQuarter:", q, "(periodMonth:", result.periodMonth, ")");
  }

  // 2) Month (Mensual) - prefer period block if available
  if (!result.periodMonth) {
    const monthCandidates = [
      // "Mes | OCTUBRE" or "Mes: OCTUBRE"
      /\bMES\b\s*(?:\||:)?\s*([A-ZÁÉÍÓÚÑ]+)/i,
      // "Mes 10"
      /\bMES\b\s*(?:\||:)?\s*(\d{1,2})\b/i,
      // Some PDFs show "PERIODO ... OCTUBRE"
      /\bPER[IÍ]ODO\b[^A-Z0-9]{0,10}([A-ZÁÉÍÓÚÑ]+)/i,
    ];

    const source = periodBlock ? periodBlock : text;
    for (const pattern of monthCandidates) {
      const m = source.match(pattern);
      if (!m) continue;

      const raw = (m[1] ?? "").toString().trim().toUpperCase();
      const numeric = parseInt(raw);
      if (!isNaN(numeric) && numeric >= 1 && numeric <= 12) {
        result.periodMonth = numeric;
        result.fieldsFound++;
        console.log("Found periodMonth:", result.periodMonth);
        break;
      }

      if (MONTH_MAP[raw]) {
        result.periodMonth = MONTH_MAP[raw];
        result.fieldsFound++;
        console.log("Found periodMonth:", result.periodMonth);
        break;
      }
    }

    if (result.periodMonth && !result.periodType) {
      result.periodType = "mensual";
      result.fieldsFound++;
      console.log("Found periodType:", result.periodType);
    }
  }

  // 3) Year - prefer period block if available
  const yearCandidates = [
    /\bA[ÑN]O\b\s*(?:\||:)?\s*(\d{4})/i,
    /\bAÑO\b\s*(\d{4})/i,
    /(20\d{2})/,
  ];

  {
    const source = periodBlock ? periodBlock : text;
    for (const pattern of yearCandidates) {
      const y = source.match(pattern);
      if (!y) continue;
      const year = parseInt(y[1]);
      if (year >= 2000 && year <= 2100) {
        result.periodYear = year;
        result.fieldsFound++;
        console.log("Found periodYear:", result.periodYear);
        break;
      }
    }
  }

  // If we only have a year, consider it annual unless tax type says otherwise.
  if (result.periodYear && !result.periodMonth && !result.periodType) {
    result.periodType = "anual";
    result.fieldsFound++;
    console.log("Found periodType:", result.periodType);
  }

  // Last fallback: infer periodType from tax type keywords
  if (!result.periodType && result.taxType) {
    if (/TRIMESTRAL/i.test(result.taxType)) result.periodType = "trimestral";
    else if (/ANUAL/i.test(result.taxType)) result.periodType = "anual";
    else if (/MENSUAL/i.test(result.taxType)) result.periodType = "mensual";
    if (result.periodType) {
      result.fieldsFound++;
      console.log("Found periodType (from taxType):", result.periodType);
    }
  }

  // Extract Payment/Presentation Date
  const datePatterns = [
    /Fecha\s+de\s+(?:presentaci[óo]n|pago)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /Fecha[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseDate(match[1]);
      if (parsed) {
        result.paymentDate = parsed;
        result.fieldsFound++;
        console.log("Found paymentDate:", result.paymentDate);
        break;
      }
    }
  }

  // Extract Amount - Total a Pagar
  const amountPatterns = [
    /TOTAL\s+A\s+PAGAR[:\s]*([\d\s,\.]+)/i,
    /MONTO\s+A\s+PAGAR[:\s]*([\d\s,\.]+)/i,
    /TOTAL[:\s]+Q?\s*([\d\s,\.]+)/i,
    /PAGAR[:\s]+Q?\s*([\d\s,\.]+)/i,
  ];
  
  for (const pattern of amountPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = parseAmount(match[1]);
      if (amount !== null) {
        result.amountPaid = amount;
        result.fieldsFound++;
        console.log("Found amountPaid:", result.amountPaid);
        break;
      }
    }
  }

  console.log("Total fields found:", result.fieldsFound);
  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfText } = await req.json();

    if (!pdfText) {
      return new Response(
        JSON.stringify({ error: "No se proporcionó texto del PDF", fieldsFound: 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Received PDF text, length:", pdfText.length);

    // Extract data using regex patterns
    const extractedData = extractDataFromText(pdfText);

    return new Response(
      JSON.stringify(extractedData),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error processing text:", error);
    const errorMessage = error instanceof Error ? error.message : "Error al procesar el texto";
    return new Response(
      JSON.stringify({ error: errorMessage, fieldsFound: 0 }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

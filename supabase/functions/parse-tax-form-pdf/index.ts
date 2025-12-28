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
    const digits = onlyDigits(accessBlock);
    if (digits.length >= 9) {
      result.accessCode = digits;
      result.fieldsFound++;
      console.log("Found accessCode (block):", result.accessCode);
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
        const digits = onlyDigits(match[1] ?? match[0]);
        if (digits.length >= 9) {
          result.accessCode = digits;
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

  // Determine period type from tax type
  if (result.taxType) {
    if (/MENSUAL/i.test(result.taxType)) {
      result.periodType = "mensual";
    } else if (/TRIMESTRAL/i.test(result.taxType)) {
      result.periodType = "trimestral";
    } else if (/ANUAL/i.test(result.taxType)) {
      result.periodType = "anual";
    }
  }

  // Extract Month (supports table format "Mes | OCTUBRE")
  const monthPatterns = [
    /Mes[:\s]*([A-ZÁÉÍÓÚÑ]+)/i,
    /Mes\s*\|\s*([A-ZÁÉÍÓÚÑ]+)/i,
    /Per[íi]odo[:\s]*([A-ZÁÉÍÓÚÑ]+)/i,
    /MES\s+DE[:\s]*([A-ZÁÉÍÓÚÑ]+)/i,
  ];

  for (const pattern of monthPatterns) {
    const match = text.match(pattern);
    if (match) {
      const monthName = match[1].toUpperCase().trim();
      if (MONTH_MAP[monthName]) {
        result.periodMonth = MONTH_MAP[monthName];
        result.fieldsFound++;
        console.log("Found periodMonth:", result.periodMonth);
        break;
      }
    }
  }

  // Extract Year (supports table format "Año | 2025")
  const yearPatterns = [
    /A[ÑN]O[:\s]*(\d{4})/i,
    /A[ÑN]o\s*\|\s*(\d{4})/i,
    /Per[íi]odo[:\s]*\d{4}[\s\-]+(\d{4})/i,
    /(\d{4})\s*(?:Per[íi]odo|A[ÑN]O)/i,
  ];

  for (const pattern of yearPatterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      if (year >= 2000 && year <= 2100) {
        result.periodYear = year;
        result.fieldsFound++;
        console.log("Found periodYear:", result.periodYear);
        break;
      }
    }
  }

  // Also try to find year from other patterns if not found
  if (!result.periodYear) {
    const yearMatch = text.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      result.periodYear = parseInt(yearMatch[1]);
      result.fieldsFound++;
      console.log("Found periodYear (fallback):", result.periodYear);
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

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  
  // Normalize text: replace multiple spaces/newlines with single space for easier matching
  const normalizedText = text.replace(/\s+/g, " ");
  
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
      break;
    }
  }

  // ========== IMPROVED PERIOD EXTRACTION ==========
  
  // Try multiple strategies for extracting month and year
  
  // Strategy 1: Direct patterns in full text for "Mes: ENERO" or "Mes ENERO" format
  const directMonthPatterns = [
    // "Mes: ENERO" or "Mes ENERO" 
    /\bMes\s*[:\|\-]?\s*(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b/i,
    // "Mes: 1" or "Mes 12"
    /\bMes\s*[:\|\-]?\s*(\d{1,2})\b/i,
  ];
  
  const directYearPatterns = [
    // "Año: 2024" or "Año 2024"
    /\bA[ñn]o\s*[:\|\-]?\s*(20\d{2})\b/i,
  ];
  
  // Try to find month directly in text first
  for (const pattern of directMonthPatterns) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1].trim().toUpperCase();
      const numeric = parseInt(raw);
      
      if (!isNaN(numeric) && numeric >= 1 && numeric <= 12) {
        result.periodMonth = numeric;
        result.fieldsFound++;
        break;
      } else if (MONTH_MAP[raw]) {
        result.periodMonth = MONTH_MAP[raw];
        result.fieldsFound++;
        break;
      }
    }
  }
  
  // Try to find year directly in text first
  for (const pattern of directYearPatterns) {
    const match = text.match(pattern);
    if (match) {
      const year = parseInt(match[1]);
      if (year >= 2000 && year <= 2100) {
        result.periodYear = year;
        result.fieldsFound++;
        break;
      }
    }
  }
  
  // Strategy 2: Extract period block with expanded end markers
  if (!result.periodMonth || !result.periodYear) {
    const periodBlock = extractBetween(
      text,
      /PER[IÍ]ODO\s+DE\s+IMPOSICI[ÓO]N/i,
      /RENTA\s+IMPONIBLE|DETERMINACI[ÓO]N|RETENCIONES|QU[ÉE]\s+RETENCIONES|VALID(?:E|ACI[ÓO]N)|FECHA\s+DE\s+PRESENTACI[ÓO]N|TOTAL\s+A\s+PAGAR|Ingresos\s+por\s+venta/i
    );
    const periodText = (periodBlock || "").toUpperCase();

    // Quarter (Trimestral)
    if (!result.periodMonth) {
      const quarterMatch = periodText.match(/TRIMESTRE\s*[:\-\|\s]*([1-4])\b/i);
      if (quarterMatch) {
        const q = parseInt(quarterMatch[1]);
        result.periodType = "trimestral";
        result.periodMonth = (q - 1) * 3 + 1; // store starting month of quarter
        result.fieldsFound++;
      }
    }

    // Month from period block
    if (!result.periodMonth) {
      const monthCandidates = [
        /\bMES\b\s*(?:\||:)?\s*([A-ZÁÉÍÓÚÑ]+)/i,
        /\bMES\b\s*(?:\||:)?\s*(\d{1,2})\b/i,
      ];

      for (const pattern of monthCandidates) {
        const m = periodText.match(pattern);
        if (!m) continue;

        const raw = (m[1] ?? "").toString().trim().toUpperCase();

        // Skip if the matched "month" is actually just "MES" header or other noise
        if (raw === "MES" || raw === "AÑO" || raw === "DE" || raw === "") continue;

        const numeric = parseInt(raw);
        if (!isNaN(numeric) && numeric >= 1 && numeric <= 12) {
          result.periodMonth = numeric;
          result.fieldsFound++;
          break;
        }

        if (MONTH_MAP[raw]) {
          result.periodMonth = MONTH_MAP[raw];
          result.fieldsFound++;
          break;
        }
      }
    }

    // Year from period block
    if (!result.periodYear) {
      const yearCandidates = [
        /\bA[ÑN]O\b\s*(?:\||:)?\s*(\d{4})/i,
        /\bAÑO\b\s*(\d{4})/i,
        /\b(20\d{2})\b/,
      ];

      for (const pattern of yearCandidates) {
        const y = periodText.match(pattern);
        if (!y) continue;
        const year = parseInt(y[1]);
        if (year >= 2000 && year <= 2100) {
          result.periodYear = year;
          result.fieldsFound++;
          break;
        }
      }
    }
  }
  
  // Strategy 3: Look for month names anywhere in text (fallback)
  if (!result.periodMonth) {
    // Look for standalone month names that appear near "PERÍODO" section
    const monthNames = Object.keys(MONTH_MAP);
    for (const monthName of monthNames) {
      // Look for the month name as a standalone word
      const monthPattern = new RegExp(`\\b${monthName}\\b`, 'i');
      const match = text.match(monthPattern);
      if (match) {
        // Verify it's likely part of period info (not date or other text)
        const idx = match.index || 0;
        const contextBefore = text.substring(Math.max(0, idx - 100), idx).toUpperCase();
        const contextAfter = text.substring(idx, idx + 50).toUpperCase();
        
        // If near "PERÍODO" or "MES" or "AÑO", consider it valid
        if (contextBefore.includes("PERÍODO") || contextBefore.includes("MES") || 
            contextBefore.includes("IMPOSICIÓN") || contextAfter.includes("2024") ||
            contextAfter.includes("2025") || contextAfter.includes("2023")) {
          result.periodMonth = MONTH_MAP[monthName];
          result.fieldsFound++;
          break;
        }
      }
    }
  }

  // Strategy 4: Look for year near month context or "Año" label
  if (!result.periodYear) {
    // If we found a month, look for year near that month
    if (result.periodMonth) {
      const monthName = Object.entries(MONTH_MAP).find(([_, v]) => v === result.periodMonth)?.[0];
      if (monthName) {
        const monthPattern = new RegExp(monthName, 'i');
        const monthMatch = text.match(monthPattern);
        if (monthMatch) {
          const idx = monthMatch.index || 0;
          // Look for year after the month name (within 100 chars)
          const afterMonth = text.substring(idx, idx + 100);
          const yearMatch = afterMonth.match(/\b(202[0-9]|201[0-9])\b/);
          if (yearMatch) {
            result.periodYear = parseInt(yearMatch[1]);
            result.fieldsFound++;
          }
        }
      }
    }
  }
  
  if (!result.periodYear) {
    // Try to find year near "Año" label in normalized text
    const yearWithLabelMatch = normalizedText.match(/A[ñn]o[:\s]*(\d{4})/i);
    if (yearWithLabelMatch) {
      const year = parseInt(yearWithLabelMatch[1]);
      if (year >= 2010 && year <= 2100) {
        result.periodYear = year;
        result.fieldsFound++;
      }
    }
  }
  
  if (!result.periodYear) {
    // Look for year near "PERÍODO DE IMPOSICIÓN" section
    const periodIdx = text.search(/PER[IÍ]ODO\s+DE\s+IMPOSICI[ÓO]N/i);
    if (periodIdx !== -1) {
      const periodContext = text.substring(periodIdx, periodIdx + 300);
      // Find years between 2010-2099 (avoid matching SAT-2000)
      const yearMatch = periodContext.match(/\b(202[0-9]|201[0-9])\b/);
      if (yearMatch) {
        result.periodYear = parseInt(yearMatch[1]);
        result.fieldsFound++;
      }
    }
  }
  
  if (!result.periodYear) {
    // Last resort: find any year 2010-2099 (excluding 2000 which is SAT-2000)
    const yearMatches = text.matchAll(/\b(20[1-9][0-9])\b/g);
    for (const match of yearMatches) {
      const year = parseInt(match[1]);
      if (year >= 2010 && year <= 2099) {
        result.periodYear = year;
        result.fieldsFound++;
        break;
      }
    }
  }

  // Determine period type if not already set
  if (result.periodMonth && !result.periodType) {
    result.periodType = "mensual";
    result.fieldsFound++;
  }

  // If we only have a year without month and periodType, check text for hints
  if (result.periodYear && !result.periodMonth && !result.periodType) {
    if (/MENSUAL|pago\s+mensual/i.test(text)) {
      result.periodType = "mensual";
    } else if (/TRIMESTRAL/i.test(text)) {
      result.periodType = "trimestral";
    } else {
      result.periodType = "anual";
    }
    result.fieldsFound++;
  }

  // Last fallback: infer periodType from tax type keywords
  if (!result.periodType && result.taxType) {
    if (/TRIMESTRAL/i.test(result.taxType)) result.periodType = "trimestral";
    else if (/ANUAL/i.test(result.taxType)) result.periodType = "anual";
    else if (/MENSUAL/i.test(result.taxType)) result.periodType = "mensual";
    if (result.periodType) {
      result.fieldsFound++;
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
        break;
      }
    }
  }

  // Extract Amount - Total a Pagar
  // Strategy 1: Look for "TOTAL A PAGAR" heading followed by amount on next line
  const totalAPagarMatch = text.match(/TOTAL\s+A\s+PAGAR\s*\n+\s*([\d]+(?:[.,]\d{1,2})?)/i);
  if (totalAPagarMatch) {
    const amount = parseAmount(totalAPagarMatch[1]);
    if (amount !== null) {
      result.amountPaid = amount;
      result.fieldsFound++;
    }
  }
  
  // Strategy 2: Look for inline patterns if not found
  if (result.amountPaid === undefined) {
    const amountPatterns = [
      /TOTAL\s+A\s+PAGAR[:\s\|]+Q?\s*([\d]+(?:[.,]\d{1,2})?)\b/i,
      /MONTO\s+A\s+PAGAR[:\s\|]+Q?\s*([\d]+(?:[.,]\d{1,2})?)\b/i,
      /Impuesto\s+a\s+pagar[:\s\|]+Q?\s*([\d]+(?:[.,]\d{1,2})?)\b/i,
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const amount = parseAmount(match[1]);
        if (amount !== null) {
          result.amountPaid = amount;
          result.fieldsFound++;
          break;
        }
      }
    }
  }

  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: "No autorizado", fieldsFound: 0 }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Token inválido o expirado", fieldsFound: 0 }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { pdfText } = await req.json();

    if (!pdfText) {
      return new Response(
        JSON.stringify({ error: "No se proporcionó texto del PDF", fieldsFound: 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

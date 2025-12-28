// SAT Guatemala CSV column mappings
// These mappings allow flexible detection of SAT-exported CSV files

// Normalize header: remove accents, special chars, convert to lowercase
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[()]/g, "") // Remove parentheses
    .replace(/\s+/g, " "); // Normalize spaces
}

// SAT column mappings for purchases (emisor data)
export const SAT_PURCHASES_MAPPING: Record<string, string[]> = {
  fecha: ["fecha de emision", "fecha de emisión"],
  serie: ["serie"],
  numero: ["numero del dte", "número del dte"],
  tipo_documento: ["tipo de dte"],
  numero_autorizacion: ["numero de autorizacion", "número de autorización"],
  nit: ["nit del emisor"],
  nombre: ["nombre completo del emisor"],
  total: ["gran total", "gran total moneda original"],
  iva: ["iva", "iva monto de este impuesto"],
  anulado: ["marca de anulado"],
  moneda: ["moneda"],
};

// SAT column mappings for sales (receptor data for SALES we're the emisor, so we need receptor)
export const SAT_SALES_MAPPING: Record<string, string[]> = {
  fecha: ["fecha de emision", "fecha de emisión"],
  serie: ["serie"],
  numero: ["numero del dte", "número del dte"],
  tipo_documento: ["tipo de dte"],
  numero_autorizacion: ["numero de autorizacion", "número de autorización"],
  nit: ["id del receptor"],
  nombre: ["nombre completo del receptor"],
  total: ["gran total", "gran total moneda original"],
  iva: ["iva", "iva monto de este impuesto"],
  anulado: ["marca de anulado"],
  moneda: ["moneda"],
};

// Find a SAT column index from headers
export function findSATColumnIndex(
  normalizedHeaders: string[],
  possibleNames: string[]
): number {
  for (const name of possibleNames) {
    const normalizedName = normalizeHeader(name);
    const index = normalizedHeaders.findIndex(h => h.includes(normalizedName) || normalizedName.includes(h));
    if (index !== -1) return index;
  }
  return -1;
}

// Parse date flexibly (DD/MM/YYYY or YYYY-MM-DD)
export function parseDateFlexible(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  
  const trimmed = dateStr.trim();
  
  // Try DD/MM/YYYY format
  const ddmmyyyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try YYYY-MM-DD format (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  return null;
}

// Parse number from SAT format (handles commas as decimal separator or thousands)
export function parseNumber(value: string): number {
  if (!value || typeof value !== "string") return 0;
  
  const trimmed = value.trim();
  if (!trimmed) return 0;
  
  // Remove currency symbols and spaces
  let cleaned = trimmed.replace(/[Q$€\s]/g, "");
  
  // If has both comma and dot, determine which is decimal separator
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  
  if (hasComma && hasDot) {
    // If comma comes after dot, comma is decimal (European: 1.234,56)
    // If dot comes after comma, dot is decimal (US: 1,234.56)
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    
    if (lastComma > lastDot) {
      // European format: 1.234,56 -> 1234.56
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      // US format: 1,234.56 -> 1234.56
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // Only comma - check if it's decimal separator (has 2 digits after)
    const parts = cleaned.split(",");
    if (parts.length === 2 && parts[1].length <= 2) {
      // Likely decimal: 100,50 -> 100.50
      cleaned = cleaned.replace(",", ".");
    } else {
      // Likely thousands: 1,234 -> 1234
      cleaned = cleaned.replace(",", "");
    }
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Detect if CSV is in SAT format
export function isSATFormat(headers: string[]): boolean {
  const normalizedHeaders = headers.map(normalizeHeader);
  
  // Check for key SAT columns
  const satColumns = ["fecha de emision", "numero del dte", "gran total", "nit del emisor"];
  let matchCount = 0;
  
  for (const col of satColumns) {
    if (normalizedHeaders.some(h => h.includes(col) || col.includes(h))) {
      matchCount++;
    }
  }
  
  // If at least 2 SAT columns found, it's SAT format
  return matchCount >= 2;
}

import { supabase } from "@/integrations/supabase/client";

// Mapeo de entry_type a código de prefijo en tab_journal_entry_prefixes
const ENTRY_TYPE_TO_PREFIX_CODE: Record<string, string> = {
  diario: "MANUAL",
  apertura: "OPENING",
  cierre: "CLOSING",
  ajuste: "ADJUSTMENT",
  compras: "PURCHASES",
  ventas: "SALES",
};

interface PrefixInfo {
  code: string;
  prefix: string;
}

/**
 * Obtiene el prefijo correspondiente a un tipo de partida
 */
export async function getPrefixForEntryType(entryType: string): Promise<string> {
  const prefixCode = ENTRY_TYPE_TO_PREFIX_CODE[entryType] || "MANUAL";
  
  const { data } = await supabase
    .from("tab_journal_entry_prefixes")
    .select("prefix")
    .eq("code", prefixCode)
    .eq("is_active", true)
    .maybeSingle();

  return data?.prefix || "PART";
}

/**
 * Genera el número de partida con formato PREFIJO-YYYY-###
 * @param prefix - El prefijo de la partida (ej: PART, VENT, COMP)
 * @param year - El año de la partida
 * @param sequenceNumber - El número secuencial
 * @returns El número de partida formateado
 */
export function formatEntryNumber(prefix: string, year: number, sequenceNumber: number): string {
  // Si el número es menor a 1000, usar 3 dígitos; si no, usar el número completo
  const paddedNumber = sequenceNumber < 1000 
    ? String(sequenceNumber).padStart(3, "0") 
    : String(sequenceNumber);
  
  return `${prefix}-${year}-${paddedNumber}`;
}

/**
 * Parsea un número de partida para extraer sus componentes
 * @param entryNumber - El número de partida (ej: PART-2025-001, VENT-2025-12)
 * @returns Objeto con prefix, year y sequence, o null si no se puede parsear
 */
export function parseEntryNumber(entryNumber: string): { prefix: string; year: number; sequence: number } | null {
  // Intenta parsear formato nuevo: PREFIJO-YYYY-###
  const newFormatMatch = entryNumber.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (newFormatMatch) {
    return {
      prefix: newFormatMatch[1],
      year: parseInt(newFormatMatch[2]),
      sequence: parseInt(newFormatMatch[3]),
    };
  }
  
  // Intenta parsear formato antiguo: PD-XXXXXX o VENT-YYYY## (sin guión entre año y número)
  const oldFormatMatch = entryNumber.match(/^([A-Z]+)-(\d+)$/);
  if (oldFormatMatch) {
    const numPart = oldFormatMatch[2];
    // Si tiene 6+ dígitos y empieza con 202X, probablemente es VENT-YYYY## o similar
    if (numPart.length >= 6 && numPart.startsWith("202")) {
      const year = parseInt(numPart.substring(0, 4));
      const sequence = parseInt(numPart.substring(4));
      return { prefix: oldFormatMatch[1], year, sequence };
    }
    // Formato PD-XXXXXX simple
    return {
      prefix: oldFormatMatch[1],
      year: new Date().getFullYear(),
      sequence: parseInt(numPart),
    };
  }
  
  return null;
}

/**
 * Obtiene el siguiente número de partida disponible para un tipo y año específico
 * @param enterpriseId - ID de la empresa
 * @param entryType - Tipo de partida (diario, apertura, etc.)
 * @param entryDate - Fecha de la partida para determinar el año
 * @returns El siguiente número de partida disponible
 */
export async function getNextEntryNumber(
  enterpriseId: string,
  entryType: string,
  entryDate: string
): Promise<string> {
  const year = new Date(entryDate).getFullYear();
  const prefix = await getPrefixForEntryType(entryType);
  
  // Obtener todas las partidas existentes con este prefijo y año
  const { data: existingEntries } = await supabase
    .from("tab_journal_entries")
    .select("entry_number")
    .eq("enterprise_id", parseInt(enterpriseId))
    .or(`entry_number.ilike.${prefix}-${year}-%,entry_number.ilike.${prefix}-${year}%`);

  // Encontrar el número máximo actual
  let maxSequence = 0;
  (existingEntries || []).forEach((row) => {
    const parsed = parseEntryNumber(row.entry_number);
    if (parsed && parsed.prefix === prefix && parsed.year === year) {
      maxSequence = Math.max(maxSequence, parsed.sequence);
    }
  });

  // Buscar el siguiente número disponible
  let candidate = maxSequence + 1;
  const candidateStr = formatEntryNumber(prefix, year, candidate);
  
  // Verificar que no existe
  const { data: existing } = await supabase
    .from("tab_journal_entries")
    .select("id")
    .eq("enterprise_id", parseInt(enterpriseId))
    .eq("entry_number", candidateStr)
    .maybeSingle();

  if (!existing) {
    return candidateStr;
  }

  // Si existe, buscar el siguiente disponible
  for (let i = 0; i < 50; i++) {
    candidate++;
    const nextCandidateStr = formatEntryNumber(prefix, year, candidate);
    const { data: nextExisting } = await supabase
      .from("tab_journal_entries")
      .select("id")
      .eq("enterprise_id", parseInt(enterpriseId))
      .eq("entry_number", nextCandidateStr)
      .maybeSingle();

    if (!nextExisting) {
      return nextCandidateStr;
    }
  }

  // Fallback improbable
  return formatEntryNumber(prefix, year, candidate + 1);
}

/**
 * Busca el siguiente número disponible evitando duplicados
 * @param enterpriseId - ID de la empresa
 * @param currentNumber - Número actual propuesto
 * @param entryType - Tipo de partida
 * @param entryDate - Fecha de la partida
 * @returns El siguiente número disponible
 */
export async function findNextAvailableNumber(
  enterpriseId: string,
  currentNumber: string,
  entryType: string,
  entryDate: string
): Promise<string> {
  const year = new Date(entryDate).getFullYear();
  const prefix = await getPrefixForEntryType(entryType);
  const parsed = parseEntryNumber(currentNumber);
  
  let startSequence = parsed?.sequence || 1;
  
  // Obtener todas las partidas existentes con este prefijo y año
  const { data: existingEntries } = await supabase
    .from("tab_journal_entries")
    .select("entry_number")
    .eq("enterprise_id", parseInt(enterpriseId))
    .ilike("entry_number", `${prefix}-${year}-%`);

  const existingNumbers = new Set(
    (existingEntries || []).map((e) => e.entry_number)
  );

  // Encontrar el máximo existente
  let maxSequence = startSequence;
  existingEntries?.forEach((row) => {
    const p = parseEntryNumber(row.entry_number);
    if (p && p.prefix === prefix && p.year === year) {
      maxSequence = Math.max(maxSequence, p.sequence);
    }
  });

  // Buscar siguiente disponible
  let candidate = maxSequence + 1;
  for (let i = 0; i < 50; i++) {
    const candidateStr = formatEntryNumber(prefix, year, candidate);
    if (!existingNumbers.has(candidateStr)) {
      return candidateStr;
    }
    candidate++;
  }

  return formatEntryNumber(prefix, year, candidate);
}

import { supabase } from "@/integrations/supabase/client";

/**
 * Preview del siguiente número de partida (NO reserva — solo para mostrar en UI).
 * Usa la función RPC `preview_next_entry_number` que lee el contador sin modificarlo.
 */
export async function previewNextEntryNumber(
  enterpriseId: string,
  entryType: string,
  entryDate: string
): Promise<string> {
  const { data, error } = await supabase.rpc("preview_next_entry_number", {
    p_enterprise_id: parseInt(enterpriseId),
    p_entry_type: entryType,
    p_entry_date: entryDate,
  });

  if (error) {
    console.error("[previewNextEntryNumber] error:", error);
    return "---";
  }

  return data as string;
}

/**
 * Reserva atómicamente el siguiente número de partida (usar SOLO al guardar).
 * Usa la función RPC `allocate_journal_entry_number` con INSERT ... ON CONFLICT + RETURNING.
 */
export async function allocateEntryNumber(
  enterpriseId: string,
  entryType: string,
  entryDate: string
): Promise<string> {
  const { data, error } = await supabase.rpc("allocate_journal_entry_number", {
    p_enterprise_id: parseInt(enterpriseId),
    p_entry_type: entryType,
    p_entry_date: entryDate,
  });

  if (error) {
    throw new Error(`Error al asignar número de partida: ${error.message}`);
  }

  return data as string;
}

/**
 * Parsea un número de partida para extraer sus componentes
 * @param entryNumber - El número de partida (ej: PART-2025-001)
 * @returns Objeto con prefix, year y sequence, o null si no se puede parsear
 */
export function parseEntryNumber(entryNumber: string): { prefix: string; year: number; month?: number; sequence: number } | null {
  // New format: PREFIX-YYYY-MM-####
  const match4 = entryNumber.match(/^([A-Z]+)-(\d{4})-(\d{2})-(\d+)$/);
  if (match4) {
    return {
      prefix: match4[1],
      year: parseInt(match4[2]),
      month: parseInt(match4[3]),
      sequence: parseInt(match4[4]),
    };
  }

  // Legacy format: PREFIX-YYYY-###
  const match3 = entryNumber.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
  if (match3) {
    return {
      prefix: match3[1],
      year: parseInt(match3[2]),
      sequence: parseInt(match3[3]),
    };
  }

  // Formato antiguo: PREFIX-DIGITS
  const oldMatch = entryNumber.match(/^([A-Z]+)-(\d+)$/);
  if (oldMatch) {
    const numPart = oldMatch[2];
    if (numPart.length >= 6 && numPart.startsWith("202")) {
      const year = parseInt(numPart.substring(0, 4));
      const sequence = parseInt(numPart.substring(4));
      return { prefix: oldMatch[1], year, sequence };
    }
    return {
      prefix: oldMatch[1],
      year: new Date().getFullYear(),
      sequence: parseInt(numPart),
    };
  }

  return null;
}

/**
 * Formatea un número de partida con formato PREFIJO-YYYY-###
 */
export function formatEntryNumber(prefix: string, year: number, sequenceNumber: number): string {
  const paddedNumber = sequenceNumber < 1000
    ? String(sequenceNumber).padStart(3, "0")
    : String(sequenceNumber);

  return `${prefix}-${year}-${paddedNumber}`;
}

// Legacy exports for backward compatibility (other modules like LibroVentas, etc.)
export const getNextEntryNumber = previewNextEntryNumber;
export const findNextAvailableNumber = async (
  enterpriseId: string,
  _currentNumber: string,
  entryType: string,
  entryDate: string
): Promise<string> => {
  return allocateEntryNumber(enterpriseId, entryType, entryDate);
};

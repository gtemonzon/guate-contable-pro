/**
 * Utilidades para parseo y validación de extractos bancarios
 */

export interface ColumnMapping {
  fecha: number | null;
  descripcion: number | null;
  referencia: number | null;
  debito: number | null;
  credito: number | null;
  saldo: number | null;
}

export interface ParsedBankRow {
  rowNumber: number;
  fecha: Date | null;
  fechaOriginal: string;
  descripcion: string;
  referencia: string;
  debito: number;
  credito: number;
  saldo: number | null;
  isValid: boolean;
  errors: string[];
  selected: boolean;
}

export interface ValidationSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  emptyRows: number;
}

// Palabras clave para detección automática de columnas
const COLUMN_KEYWORDS: Record<keyof ColumnMapping, string[]> = {
  fecha: ['fecha', 'date', 'fec', 'dia', 'day'],
  descripcion: ['descripcion', 'concepto', 'detalle', 'description', 'desc', 'movimiento', 'transaccion'],
  referencia: ['referencia', 'documento', 'ref', 'numero', 'no.', 'no', 'doc', 'cheque', 'comprobante'],
  debito: ['debito', 'cargo', 'debit', 'retiro', 'salida', 'debe', 'cargos', 'debitos'],
  credito: ['credito', 'abono', 'credit', 'deposito', 'entrada', 'haber', 'abonos', 'creditos'],
  saldo: ['saldo', 'balance', 'disponible'],
};

/**
 * Detecta automáticamente el mapeo de columnas basado en los encabezados
 */
export function autoDetectColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    fecha: null,
    descripcion: null,
    referencia: null,
    debito: null,
    credito: null,
    saldo: null,
  };

  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim();
    
    for (const [field, keywords] of Object.entries(COLUMN_KEYWORDS)) {
      if (mapping[field as keyof ColumnMapping] === null) {
        for (const keyword of keywords) {
          if (normalizedHeader.includes(keyword)) {
            mapping[field as keyof ColumnMapping] = index;
            break;
          }
        }
      }
    }
  });

  return mapping;
}

/**
 * Parsea una fecha en múltiples formatos
 */
export function parseDate(value: string): Date | null {
  if (!value || typeof value !== 'string') return null;
  
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Formatos comunes
  const formats = [
    // DD/MM/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD-MM-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // YYYY-MM-DD
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // YYYY/MM/DD
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
  ];

  // DD/MM/YYYY o DD-MM-YYYY
  let match = trimmed.match(formats[0]) || trimmed.match(formats[1]);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && date.getDate() === day) {
      return date;
    }
  }

  // YYYY-MM-DD o YYYY/MM/DD
  match = trimmed.match(formats[2]) || trimmed.match(formats[3]);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && date.getDate() === day) {
      return date;
    }
  }

  // Intentar parseo nativo como último recurso
  const nativeDate = new Date(trimmed);
  if (!isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  return null;
}

/**
 * Convierte un valor con formato contable a número
 * Ejemplos: "Q 1,234.56" → 1234.56, "(1,234.56)" → -1234.56, "1.234,56" → 1234.56
 */
export function parseAccountingNumber(value: string | number): number {
  if (typeof value === 'number') return value;
  if (!value || typeof value !== 'string') return 0;

  let trimmed = value.trim();
  if (!trimmed) return 0;

  // Detectar si es negativo (formato contable con paréntesis)
  const isNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  if (isNegative) {
    trimmed = trimmed.slice(1, -1);
  }

  // Detectar si es negativo con signo menos
  const hasMinusSign = trimmed.startsWith('-');
  if (hasMinusSign) {
    trimmed = trimmed.slice(1);
  }

  // Remover símbolos de moneda comunes
  trimmed = trimmed.replace(/[Q$€£GTQ\s]/gi, '');

  // Detectar formato europeo (1.234,56) vs americano (1,234.56)
  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');

  if (lastComma > lastDot) {
    // Formato europeo: 1.234,56
    trimmed = trimmed.replace(/\./g, '').replace(',', '.');
  } else {
    // Formato americano: 1,234.56
    trimmed = trimmed.replace(/,/g, '');
  }

  const result = parseFloat(trimmed);
  if (isNaN(result)) return 0;

  return (isNegative || hasMinusSign) ? -result : result;
}

/**
 * Verifica si una fila está vacía
 */
export function isEmptyRow(row: (string | number | null | undefined)[]): boolean {
  return row.every(cell => {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === 'string') return cell.trim() === '';
    return false;
  });
}

/**
 * Parsea una fila de datos usando el mapeo de columnas
 */
export function parseRow(
  row: (string | number | null | undefined)[],
  rowNumber: number,
  mapping: ColumnMapping
): ParsedBankRow {
  const errors: string[] = [];

  // Obtener valores crudos
  const fechaRaw = mapping.fecha !== null ? String(row[mapping.fecha] ?? '') : '';
  const descripcionRaw = mapping.descripcion !== null ? String(row[mapping.descripcion] ?? '') : '';
  const referenciaRaw = mapping.referencia !== null ? String(row[mapping.referencia] ?? '') : '';
  const debitoRaw = mapping.debito !== null ? row[mapping.debito] : 0;
  const creditoRaw = mapping.credito !== null ? row[mapping.credito] : 0;
  const saldoRaw = mapping.saldo !== null ? row[mapping.saldo] : null;

  // Parsear fecha
  const fecha = parseDate(fechaRaw);
  if (mapping.fecha !== null && !fecha && fechaRaw.trim()) {
    errors.push(`Fecha inválida: "${fechaRaw}"`);
  } else if (mapping.fecha !== null && !fechaRaw.trim()) {
    errors.push('Fecha requerida');
  }

  // Parsear descripción
  const descripcion = descripcionRaw.trim();
  if (!descripcion && mapping.descripcion !== null) {
    errors.push('Descripción requerida');
  }

  // Parsear montos
  const debito = parseAccountingNumber(debitoRaw as string | number);
  const credito = parseAccountingNumber(creditoRaw as string | number);
  const saldo = saldoRaw !== null ? parseAccountingNumber(saldoRaw as string | number) : null;

  // Validar que al menos hay un movimiento
  if (debito === 0 && credito === 0) {
    errors.push('Debe tener débito o crédito');
  }

  return {
    rowNumber,
    fecha,
    fechaOriginal: fechaRaw,
    descripcion,
    referencia: referenciaRaw.trim(),
    debito: Math.abs(debito),
    credito: Math.abs(credito),
    saldo,
    isValid: errors.length === 0,
    errors,
    selected: errors.length === 0,
  };
}

/**
 * Valida todas las filas y genera resumen
 */
export function validateData(
  data: (string | number | null | undefined)[][],
  mapping: ColumnMapping,
  headerRow: number = 0
): { rows: ParsedBankRow[]; summary: ValidationSummary } {
  const rows: ParsedBankRow[] = [];
  let emptyRows = 0;
  let validRows = 0;
  let errorRows = 0;

  // Saltar la fila de encabezados
  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i];
    
    if (isEmptyRow(row)) {
      emptyRows++;
      continue;
    }

    const parsed = parseRow(row, i + 1, mapping);
    rows.push(parsed);

    if (parsed.isValid) {
      validRows++;
    } else {
      errorRows++;
    }
  }

  return {
    rows,
    summary: {
      totalRows: rows.length + emptyRows,
      validRows,
      errorRows,
      emptyRows,
    },
  };
}

/**
 * Genera una plantilla de ejemplo en formato array para Excel
 */
export function generateExampleTemplate(): (string | number)[][] {
  return [
    ['Fecha', 'Descripción', 'No. Documento', 'Débito', 'Crédito', 'Saldo'],
    ['01/01/2025', 'Depósito inicial', '001', 0, 10000.00, 10000.00],
    ['05/01/2025', 'Pago a proveedor ABC', 'CHK-123', 2500.00, 0, 7500.00],
    ['10/01/2025', 'Cobro factura #456', 'DEP-789', 0, 5000.00, 12500.00],
    ['15/01/2025', 'Pago servicios', 'TRF-001', 1500.00, 0, 11000.00],
    ['20/01/2025', 'Transferencia recibida', 'TRF-002', 0, 3000.00, 14000.00],
  ];
}

/**
 * Formatea una fecha para mostrar
 */
export function formatDateForDisplay(date: Date | null): string {
  if (!date) return '-';
  return date.toLocaleDateString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formatea un monto para mostrar
 */
export function formatAmountForDisplay(amount: number): string {
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 2,
  }).format(amount);
}

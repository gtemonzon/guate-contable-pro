// Utility for sanitizing error messages to prevent information leakage

export function getSafeErrorMessage(error: any): string {
  // Handle PostgreSQL error codes
  if (error.code === '23505') return 'Este registro ya existe';
  if (error.code === '23503') return 'Referencia inválida o dato relacionado no encontrado';
  if (error.code === '23502') return 'Falta información requerida';
  if (error.code === '22P02') return 'Formato de datos inválido';
  if (error.code === '42501') return 'Sin permisos para realizar esta operación';
  
  // Handle RLS policy violations
  if (error.message?.includes('RLS') || error.message?.includes('policy')) {
    return 'Sin permisos para esta operación';
  }
  
  // Handle auth errors
  if (error.message?.includes('JWT') || error.message?.includes('auth')) {
    return 'Sesión expirada. Por favor inicie sesión nuevamente.';
  }
  
  // Handle network errors
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    return 'Error de conexión. Por favor verifique su conexión a internet.';
  }
  
  // Generic safe error message
  return 'Ocurrió un error. Por favor intente nuevamente.';
}

// Sanitize CSV field to prevent CSV injection attacks
export function sanitizeCSVField(value: string): string {
  if (!value) return value;
  
  // Prevent CSV injection by escaping fields that start with formula characters
  if (/^[=+\-@]/.test(value)) {
    return "'" + value;
  }
  
  return value;
}

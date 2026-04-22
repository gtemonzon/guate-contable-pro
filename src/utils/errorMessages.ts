// Utility for sanitizing error messages to prevent information leakage
import { isNetworkError } from "./networkErrors";

export function getSafeErrorMessage(error: unknown): string {
  // Network/connectivity errors take precedence — show a clear, friendly message.
  if (isNetworkError(error)) {
    return "Sin conexión a internet. Intenta de nuevo en unos momentos.";
  }

  // Extract message from various error formats
  const errObj = error as Record<string, unknown> | null | undefined;
  const errorMessage = String(errObj?.message || errObj?.details || errObj?.hint || '');
  
  // Handle PostgreSQL/Supabase database errors with detailed messages
  // These come from triggers and constraints - they're safe to show
  if (errorMessage.includes('La fecha de la factura')) {
    return errorMessage;
  }
  
  if (errorMessage.includes('período contable') || 
      errorMessage.includes('periodo contable')) {
    return errorMessage;
  }
  
  // If it's a custom Error with a message that doesn't expose internals, show it
  if (error instanceof Error && error.message) {
    // Check if it's a user-friendly custom message (from our code)
    const msg = error.message;
    
    // Allow through specific custom messages that are safe to show
    if (msg.includes("No se encontraron") || 
        msg.includes("columnas requeridas") ||
        msg.includes("archivo está vacío") ||
        msg.includes("Fecha inválida") ||
        msg.includes("facturas anuladas") ||
        msg.includes("período contable") ||
        msg.includes("periodo contable") ||
        msg.includes("Total debe ser") ||
        msg.includes("es requerido") ||
        msg.includes("Errores:") ||
        msg.includes("registros válidos") ||
        msg.includes("mes seleccionado") ||
        msg.includes("debe estar dentro")) {
      return msg;
    }
  }
  
  // Handle PostgreSQL error codes with detailed message when available
  const errorCode = (errObj as Record<string, unknown>)?.code;
  if (errorCode === '23505') {
    if (errorMessage) return `Registro duplicado: ${errorMessage}`;
    return 'Este registro ya existe';
  }
  if (errorCode === '23503') return 'Referencia inválida o dato relacionado no encontrado';
  if (errorCode === '23502') return 'Falta información requerida';
  if (errorCode === '22P02') return 'Formato de datos inválido';
  if (errorCode === '42501') return 'Sin permisos para realizar esta operación';
  if (errorCode === 'P0001') {
    // P0001 is RAISE EXCEPTION from triggers - show the message
    return errorMessage || 'Error de validación en la base de datos';
  }
  
  // Handle RLS policy violations
  if (errorMessage?.includes('RLS') || errorMessage?.includes('policy')) {
    return 'Sin permisos para esta operación';
  }
  
  // Handle auth errors
  if (errorMessage?.includes('JWT') || errorMessage?.includes('auth')) {
    return 'Sesión expirada. Por favor inicie sesión nuevamente.';
  }
  
  // Handle network errors
  if (errorMessage?.includes('fetch') || errorMessage?.includes('network')) {
    return 'Error de conexión. Por favor verifique su conexión a internet.';
  }
  
  // If we have any message that looks user-friendly (contains Spanish), show it
  if (errorMessage && /[áéíóúñ¿¡]/i.test(errorMessage)) {
    return errorMessage;
  }
  
  // Generic safe error message
  return 'Ocurrió un error. Por favor intente nuevamente.';
}

// Sanitize authentication error messages to prevent account enumeration
export function getSafeAuthError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  // Don't differentiate between wrong email vs wrong password (prevents account enumeration)
  if (msg?.includes('Invalid') || 
      msg?.includes('not found') ||
      msg?.includes('credentials') ||
      msg?.includes('Email not confirmed')) {
    return 'Credenciales inválidas. Verifica tu correo y contraseña.';
  }
  
  // Registration errors
  if (msg?.includes('already registered') || 
      msg?.includes('already been registered')) {
    return 'Este correo ya está registrado.';
  }
  
  // Password validation
  if (msg?.includes('Password')) {
    return 'La contraseña no cumple con los requisitos mínimos.';
  }
  
  // Rate limiting
  if (msg?.includes('rate limit') || msg?.includes('too many')) {
    return 'Demasiados intentos. Por favor espera unos minutos.';
  }
  
  // Password reset errors
  if (msg?.includes('email not found') || msg?.includes('User not found')) {
    return 'Si ese correo existe en nuestro sistema, recibirás un enlace de recuperación.';
  }
  
  if (msg?.includes('invalid_token') || msg?.includes('expired')) {
    return 'El enlace de recuperación ha expirado. Solicita uno nuevo.';
  }
  
  // Generic auth error
  return 'Error de autenticación. Por favor intenta nuevamente.';
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

// Utility for sanitizing error messages to prevent information leakage

export function getSafeErrorMessage(error: any): string {
  // Extract message from various error formats
  const errorMessage = error?.message || error?.details || error?.hint || '';
  
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
  if (error.code === '23505') {
    if (errorMessage) return `Registro duplicado: ${errorMessage}`;
    return 'Este registro ya existe';
  }
  if (error.code === '23503') return 'Referencia inválida o dato relacionado no encontrado';
  if (error.code === '23502') return 'Falta información requerida';
  if (error.code === '22P02') return 'Formato de datos inválido';
  if (error.code === '42501') return 'Sin permisos para realizar esta operación';
  if (error.code === 'P0001') {
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
export function getSafeAuthError(error: any): string {
  // Don't differentiate between wrong email vs wrong password (prevents account enumeration)
  if (error.message?.includes('Invalid') || 
      error.message?.includes('not found') ||
      error.message?.includes('credentials') ||
      error.message?.includes('Email not confirmed')) {
    return 'Credenciales inválidas. Verifica tu correo y contraseña.';
  }
  
  // Registration errors
  if (error.message?.includes('already registered') || 
      error.message?.includes('already been registered')) {
    return 'Este correo ya está registrado.';
  }
  
  // Password validation
  if (error.message?.includes('Password')) {
    return 'La contraseña no cumple con los requisitos mínimos.';
  }
  
  // Rate limiting
  if (error.message?.includes('rate limit') || error.message?.includes('too many')) {
    return 'Demasiados intentos. Por favor espera unos minutos.';
  }
  
  // Password reset errors
  if (error.message?.includes('email not found') || error.message?.includes('User not found')) {
    return 'Si ese correo existe en nuestro sistema, recibirás un enlace de recuperación.';
  }
  
  if (error.message?.includes('invalid_token') || error.message?.includes('expired')) {
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

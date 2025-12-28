// Utility for sanitizing error messages to prevent information leakage

export function getSafeErrorMessage(error: any): string {
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
        msg.includes("Total debe ser") ||
        msg.includes("es requerido") ||
        msg.includes("Errores:") ||
        msg.includes("registros válidos")) {
      return msg;
    }
  }
  
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

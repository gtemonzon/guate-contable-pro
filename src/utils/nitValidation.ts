/**
 * Validates a Guatemalan NIT (Número de Identificación Tributaria).
 *
 * Algorithm:
 * 1. Strip hyphens/spaces, uppercase the string.
 * 2. The last character is the check digit (0-9 or 'K').
 * 3. Multiply each remaining digit by a positional weight starting at 2
 *    from right to left.
 * 4. Sum all products, compute remainder = sum % 11.
 * 5. Expected check digit = 11 - remainder.
 *    If result is 10 → check digit is 'K'; if 11 → check digit is '0'.
 *
 * Special case: "CF" (Consumidor Final) is always valid.
 */
export function validateNIT(nit: string): boolean {
  if (!nit || typeof nit !== "string") return false;

  // Sanitise: remove hyphens, spaces, leading/trailing whitespace
  const cleaned = nit.replace(/[-\s]/g, "").trim().toUpperCase();

  // "CF" is a valid NIT in Guatemala (Consumidor Final)
  if (cleaned === "CF") return true;

  // Must be at least 2 characters (digits + check digit)
  if (cleaned.length < 2) return false;

  const body = cleaned.slice(0, -1);
  const checkChar = cleaned.slice(-1);

  // Body must be all digits
  if (!/^\d+$/.test(body)) return false;

  // Check digit must be a digit or 'K'
  if (!/^[\dK]$/.test(checkChar)) return false;

  // Calculate expected check digit
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    // Weight increases from 2 starting at the rightmost body digit
    const weight = body.length - i + 1;
    sum += parseInt(body[i], 10) * weight;
  }

  const remainder = sum % 11;
  const expected = 11 - remainder;

  let expectedChar: string;
  if (expected === 10) {
    expectedChar = "K";
  } else if (expected === 11) {
    expectedChar = "0";
  } else {
    expectedChar = expected.toString();
  }

  return checkChar === expectedChar;
}

/**
 * Sanitises a NIT string by removing hyphens (real-time input helper).
 */
export function sanitizeNIT(value: string): string {
  return value.replace(/-/g, "");
}

/** Fecha local yyyy-mm-dd (no UTC). */
export function localTodayISO(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isValidISODate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function validateOpeningDate(
  openingDate: string,
  today: string,
  earliestMovementDate: string | null,
): { error: string | null; warning: string | null } {
  if (!openingDate || !openingDate.trim()) {
    return { error: "Indique la fecha del saldo inicial.", warning: null };
  }
  if (!isValidISODate(openingDate)) {
    return { error: "La fecha del saldo inicial no es válida.", warning: null };
  }
  if (openingDate > today) {
    return { error: "La fecha del saldo inicial no puede ser futura.", warning: null };
  }
  if (earliestMovementDate && openingDate > earliestMovementDate) {
    return {
      error: null,
      warning: `Hay movimientos desde ${formatDMY(earliestMovementDate)}: un saldo inicial posterior a esa fecha dejaría existencias negativas en el kardex hasta esa fecha.`,
    };
  }
  return { error: null, warning: null };
}

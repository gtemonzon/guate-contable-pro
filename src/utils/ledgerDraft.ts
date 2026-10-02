/**
 * Borrador local (en este navegador) de la factura NUEVA que se está escribiendo en
 * Libros Fiscales. Mientras no cumpla el mínimo para guardarse en la base, lo escrito
 * vive aquí: si se cierra la pestaña o se recarga la página, se ofrece restaurarlo.
 *
 * Todo va envuelto en try/catch: sin localStorage o con la cuota llena, el borrador
 * simplemente no se guarda (nunca rompe la captura).
 */
import type { LedgerKind } from "./ledgerMinimum";

export const LEDGER_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LedgerDraft<T> {
  /** Momento en que se guardó (ms epoch). */
  savedAt: number;
  row: T;
}

/** Almacenamiento mínimo (localStorage o un doble en pruebas). */
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): DraftStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** "ledgerDraft:<kind>:<enterpriseId>:<año-mes>", p. ej. "ledgerDraft:purchase:12:2026-10". */
export function ledgerDraftKey(kind: LedgerKind, enterpriseId: string | number, year: number, month: number): string {
  return `ledgerDraft:${kind}:${enterpriseId}:${year}-${String(month).padStart(2, "0")}`;
}

export function saveLedgerDraft<T>(key: string, row: T, now: number = Date.now(), storage = defaultStorage()): void {
  if (!storage) return;
  try {
    const draft: LedgerDraft<T> = { savedAt: now, row };
    storage.setItem(key, JSON.stringify(draft));
  } catch {
    // Cuota llena o almacenamiento bloqueado: silencioso.
  }
}

/** Lee el borrador; si caducó (más de 7 días) o está dañado, lo borra y devuelve null. */
export function readLedgerDraft<T>(key: string, now: number = Date.now(), storage = defaultStorage()): LedgerDraft<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LedgerDraft<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.row || now - parsed.savedAt > LEDGER_DRAFT_TTL_MS) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try { storage.removeItem(key); } catch { /* silencioso */ }
    return null;
  }
}

export function clearLedgerDraft(key: string, storage = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // silencioso
  }
}

/** "dd/mm hh:mm" (hora local) para el aviso de restaurar. */
export function formatDraftTimestamp(savedAt: number): string {
  const d = new Date(savedAt);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

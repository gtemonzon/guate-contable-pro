/**
 * Run with: bunx vitest run src/utils/ledgerDraft.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  ledgerDraftKey, saveLedgerDraft, readLedgerDraft, clearLedgerDraft, formatDraftTimestamp, LEDGER_DRAFT_TTL_MS,
} from "./ledgerDraft";

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    size: () => m.size,
  };
}

describe("ledgerDraft", () => {
  it("clave por tipo, empresa y mes", () => {
    expect(ledgerDraftKey("purchase", 12, 2026, 10)).toBe("ledgerDraft:purchase:12:2026-10");
    expect(ledgerDraftKey("sale", "12", 2026, 3)).toBe("ledgerDraft:sale:12:2026-03");
    expect(ledgerDraftKey("purchase", 12, 2026, 10)).not.toBe(ledgerDraftKey("sale", 12, 2026, 10));
    expect(ledgerDraftKey("purchase", 12, 2026, 10)).not.toBe(ledgerDraftKey("purchase", 13, 2026, 10));
  });

  it("guardar y leer", () => {
    const s = memoryStorage();
    const key = ledgerDraftKey("purchase", 1, 2026, 10);
    saveLedgerDraft(key, { invoice_number: "55" }, 1000, s);
    expect(readLedgerDraft(key, 2000, s)).toEqual({ savedAt: 1000, row: { invoice_number: "55" } });
  });

  it("caduca a los 7 días y se borra", () => {
    const s = memoryStorage();
    const key = "k";
    saveLedgerDraft(key, { a: 1 }, 0, s);
    expect(readLedgerDraft(key, LEDGER_DRAFT_TTL_MS, s)).not.toBeNull();
    expect(readLedgerDraft(key, LEDGER_DRAFT_TTL_MS + 1, s)).toBeNull();
    expect(s.size()).toBe(0);
  });

  it("dañado o inexistente => null", () => {
    const s = memoryStorage();
    s.setItem("bad", "{no json");
    expect(readLedgerDraft("bad", 0, s)).toBeNull();
    expect(readLedgerDraft("missing", 0, s)).toBeNull();
  });

  it("cuota llena: silencioso", () => {
    const s = { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => {} };
    expect(() => saveLedgerDraft("k", { a: 1 }, 0, s)).not.toThrow();
  });

  it("borrar", () => {
    const s = memoryStorage();
    saveLedgerDraft("k", { a: 1 }, 0, s);
    clearLedgerDraft("k", s);
    expect(readLedgerDraft("k", 0, s)).toBeNull();
  });

  it("formato dd/mm hh:mm", () => {
    const t = new Date(2026, 9, 2, 8, 5).getTime();
    expect(formatDraftTimestamp(t)).toBe("02/10 08:05");
  });
});

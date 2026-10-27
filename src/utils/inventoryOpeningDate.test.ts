import { describe, it, expect } from "vitest";
import { validateOpeningDate } from "./inventoryOpeningDate";

const TODAY = "2026-10-27";

describe("validateOpeningDate", () => {
  it("vacía => error", () => {
    expect(validateOpeningDate("", TODAY, null).error).not.toBeNull();
  });
  it("fecha inexistente => error", () => {
    expect(validateOpeningDate("2026-02-30", TODAY, null).error).not.toBeNull();
  });
  it("futura => error", () => {
    expect(validateOpeningDate("2026-10-28", TODAY, null).error).toBe("La fecha del saldo inicial no puede ser futura.");
  });
  it("igual a hoy sin movimientos => sin error ni warning", () => {
    expect(validateOpeningDate(TODAY, TODAY, null)).toEqual({ error: null, warning: null });
  });
  it("anterior al primer movimiento => sin error ni warning", () => {
    expect(validateOpeningDate("2025-12-31", TODAY, "2026-01-05")).toEqual({ error: null, warning: null });
  });
  it("igual al primer movimiento => sin warning", () => {
    expect(validateOpeningDate("2026-01-05", TODAY, "2026-01-05").warning).toBeNull();
  });
  it("posterior al primer movimiento => warning sin error", () => {
    const r = validateOpeningDate("2026-03-01", TODAY, "2026-01-05");
    expect(r.error).toBeNull();
    expect(r.warning).toContain("05/01/2026");
  });
  it("formato dd/mm/yyyy => error", () => {
    expect(validateOpeningDate("31/12/2025", TODAY, null).error).not.toBeNull();
  });
});

/**
 * Run with: bunx vitest run src/utils/ledgerRowMerge.test.ts
 */
/* eslint-disable */
// @ts-nocheck
import { describe, it, expect } from "vitest";
import { mergeFetchedRows, shouldDeferSilentReload } from "./ledgerRowMerge";

const opts = {
  keyOf: (r) => r._uid,
  setKey: (r, k) => ({ ...r, _uid: k }),
};

describe("mergeFetchedRows", () => {
  it("conserva la versión local de la fila en edición", () => {
    const local = [{ id: 1, _uid: "db-1", nit: "123 escribiendo" }, { id: 2, _uid: "db-2", nit: "B" }];
    const fetched = [{ id: 1, _uid: "db-1", nit: "viejo" }, { id: 2, _uid: "db-2", nit: "B2" }];
    const out = mergeFetchedRows(local, fetched, { ...opts, preserveKeys: ["db-1"] });
    expect(out.map((r) => r.nit)).toEqual(["123 escribiendo", "B2"]);
  });

  it("mantiene arriba las filas nuevas sin guardar", () => {
    const local = [{ _uid: "tmp-a", isNew: true, nit: "nuevo" }, { id: 1, _uid: "db-1" }];
    const fetched = [{ id: 3, _uid: "db-3" }, { id: 1, _uid: "db-1" }];
    const out = mergeFetchedRows(local, fetched, opts);
    expect(out.map((r) => r._uid)).toEqual(["tmp-a", "db-3", "db-1"]);
  });

  it("conserva el _uid local emparejando por id (fila recién insertada)", () => {
    const local = [{ id: 9, _uid: "tmp-x", isNew: false, nit: "A" }];
    const fetched = [{ id: 9, _uid: "db-9", nit: "A" }];
    const out = mergeFetchedRows(local, fetched, opts);
    expect(out).toEqual([{ id: 9, _uid: "tmp-x", nit: "A" }]);
  });

  it("no duplica filas", () => {
    const local = [{ id: 1, _uid: "db-1" }, { id: 1, _uid: "db-1" }];
    const fetched = [{ id: 1, _uid: "db-1" }, { id: 1, _uid: "db-1" }, { id: 2, _uid: "db-2" }];
    const out = mergeFetchedRows(local, fetched, { ...opts, preserveKeys: ["db-1"] });
    expect(out.map((r) => r._uid)).toEqual(["db-1", "db-2"]);
  });

  it("respeta el orden del servidor", () => {
    const local = [{ id: 1, _uid: "db-1" }, { id: 2, _uid: "db-2" }, { id: 3, _uid: "db-3" }];
    const fetched = [{ id: 3, _uid: "db-3" }, { id: 1, _uid: "db-1" }, { id: 2, _uid: "db-2" }];
    const out = mergeFetchedRows(local, fetched, opts);
    expect(out.map((r) => r.id)).toEqual([3, 1, 2]);
  });

  it("no pierde la fila en edición si ya no viene del servidor", () => {
    const local = [{ id: 5, _uid: "db-5", nit: "editando" }];
    const fetched = [{ id: 6, _uid: "db-6" }];
    const out = mergeFetchedRows(local, fetched, { ...opts, preserveKeys: ["db-5"] });
    expect(out.map((r) => r.id)).toEqual([5, 6]);
  });

  it("filas eliminadas en el servidor (no en edición) desaparecen", () => {
    const local = [{ id: 5, _uid: "db-5" }, { id: 6, _uid: "db-6" }];
    const fetched = [{ id: 6, _uid: "db-6" }];
    expect(mergeFetchedRows(local, fetched, opts).map((r) => r.id)).toEqual([6]);
  });

  it("ventas: clave client_id", () => {
    const local = [{ id: 4, client_id: "tmp-q" }];
    const fetched = [{ id: 4, client_id: "db-4" }];
    const out = mergeFetchedRows(local, fetched, {
      keyOf: (r) => r.client_id,
      setKey: (r, k) => ({ ...r, client_id: k }),
    });
    expect(out[0].client_id).toBe("tmp-q");
  });
});

describe("shouldDeferSilentReload", () => {
  const idle = { editingKeys: [null, null], hasUnsavedNewRows: false, saveStatus: "idle" };
  it("sin trabajo en curso: recarga", () => {
    expect(shouldDeferSilentReload(idle)).toBe(false);
    expect(shouldDeferSilentReload({ ...idle, saveStatus: "saved" })).toBe(false);
  });
  it("con edición, fila nueva o guardando: se omite", () => {
    expect(shouldDeferSilentReload({ ...idle, editingKeys: ["db-1", null] })).toBe(true);
    expect(shouldDeferSilentReload({ ...idle, editingKeys: [null, "tmp-a"] })).toBe(true);
    expect(shouldDeferSilentReload({ ...idle, hasUnsavedNewRows: true })).toBe(true);
    expect(shouldDeferSilentReload({ ...idle, saveStatus: "saving" })).toBe(true);
  });
});

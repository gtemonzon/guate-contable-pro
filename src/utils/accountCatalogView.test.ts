import { describe, it, expect } from "vitest";
import {
  filterCatalog,
  formatChipLabel,
  getRootChips,
  groupsToExpand,
  type CatalogAccount,
} from "./accountCatalogView";

const acc = (
  id: number,
  code: string,
  name: string,
  parent: number | null,
  level: number,
  mov: boolean,
): CatalogAccount => ({
  id,
  account_code: code,
  account_name: name,
  parent_account_id: parent,
  level,
  allows_movement: mov,
});

const catalog: CatalogAccount[] = [
  acc(6, "6", "GASTOS", null, 1, false),
  acc(1, "1", "ACTIVO", null, 1, false),
  acc(11, "1.1", "ACTIVO CORRIENTE", 1, 2, false),
  acc(111, "1.1.1", "Caja", 11, 3, true),
  acc(62, "6.2", "GASTOS DE ADMINISTRACIÓN", 6, 2, false),
  acc(621, "6.2.1", "SUELDOS Y SALARIOS", 62, 3, true),
  acc(622, "6.2.2", "Energía eléctrica", 62, 3, true),
];

const ids = (list: CatalogAccount[]) => list.map((a) => a.id).sort((a, b) => a - b);

describe("filterCatalog", () => {
  it("busca por código e incluye ancestros", () => {
    const r = filterCatalog(catalog, { query: "6.2.1", rootId: null });
    expect(ids(r.visible)).toEqual([6, 62, 621]);
    expect(r.matchedDetail).toBe(1);
    expect(r.totalDetail).toBe(3);
  });
  it("busca por nombre sin acentos ni mayúsculas", () => {
    expect(ids(filterCatalog(catalog, { query: "sueldos", rootId: null }).visible)).toEqual([6, 62, 621]);
    expect(ids(filterCatalog(catalog, { query: "energia", rootId: null }).visible)).toEqual([6, 62, 622]);
  });
  it("respeta rootId", () => {
    const r = filterCatalog(catalog, { query: "", rootId: 1 });
    expect(ids(r.visible)).toEqual([1, 11, 111]);
    expect(r.matchedDetail).toBe(1);
    expect(r.totalDetail).toBe(3);
    expect(filterCatalog(catalog, { query: "sueldos", rootId: 1 }).visible).toEqual([]);
  });
});

describe("filterCatalog con onlyIds", () => {
  it("solo esas cuentas y sus ancestros", () => {
    expect(ids(filterCatalog(catalog, { query: "", rootId: null, onlyIds: new Set([111, 622]) }).visible)).toEqual([1, 6, 11, 62, 111, 622]);
  });
  it("combinado con rootId y búsqueda", () => {
    const only = new Set([111, 621, 622]);
    expect(ids(filterCatalog(catalog, { query: "", rootId: 6, onlyIds: only }).visible)).toEqual([6, 62, 621, 622]);
    expect(ids(filterCatalog(catalog, { query: "energia", rootId: null, onlyIds: only }).visible)).toEqual([6, 62, 622]);
    expect(filterCatalog(catalog, { query: "caja", rootId: 6, onlyIds: only }).visible).toEqual([]);
  });
  it("conjunto vacío => ninguna coincidencia", () => {
    const r = filterCatalog(catalog, { query: "", rootId: null, onlyIds: new Set() });
    expect(r.visible).toEqual([]);
    expect(r.matchedDetail).toBe(0);
  });
  it("sin la opción no cambia", () => {
    expect(filterCatalog(catalog, { query: "", rootId: null, onlyIds: null }).visible).toEqual(catalog);
    expect(filterCatalog(catalog, { query: "", rootId: null }).visible).toEqual(catalog);
  });
});

describe("getRootChips", () => {
  it("solo raíces, ordenadas por código", () => {
    expect(getRootChips(catalog)).toEqual([
      { id: 1, code: "1", label: "Activo" },
      { id: 6, code: "6", label: "Gastos" },
    ]);
  });
});

describe("formatChipLabel", () => {
  it("formato título con conectores", () => {
    expect(formatChipLabel("COSTO DE PRODUCCION")).toBe("Costo de Produccion");
    expect(formatChipLabel("OTROS INGRESOS Y GASTOS")).toBe("Otros Ingresos y Gastos");
  });
});

describe("groupsToExpand", () => {
  it("según el nivel", () => {
    expect(groupsToExpand(catalog, 2).sort((a, b) => a - b)).toEqual([1, 6]);
    expect(groupsToExpand(catalog, 1)).toEqual([]);
    expect(groupsToExpand(catalog, null).sort((a, b) => a - b)).toEqual([1, 6, 11, 62]);
  });
});

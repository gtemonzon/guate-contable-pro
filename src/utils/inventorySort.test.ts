import { describe, it, expect } from "vitest";
import { sortInventoryItems } from "./inventorySort";

const items = [
  { sku: "B", name: "Beta", current_quantity: 2 },
  { sku: "C", name: "Alfa", current_quantity: -3 },
  { sku: "A", name: "Alfa", current_quantity: 2 },
  { sku: "D", name: "Delta", current_quantity: 0 },
];

describe("sortInventoryItems", () => {
  it("ordena menor a mayor con negativos primero", () => {
    expect(sortInventoryItems(items, "quantity-asc").map(i => i.sku)).toEqual(["C", "D", "A", "B"]);
  });
  it("ordena mayor a menor con negativos al final", () => {
    expect(sortInventoryItems(items, "quantity-desc").map(i => i.sku)).toEqual(["A", "B", "D", "C"]);
  });
  it("desempata nombre por código", () => {
    expect(sortInventoryItems(items, "name").map(i => i.sku)).toEqual(["A", "C", "B", "D"]);
  });
  it("ordena por código por omisión", () => {
    expect(sortInventoryItems(items, "code").map(i => i.sku)).toEqual(["A", "B", "C", "D"]);
  });
  it("no muta el arreglo y conserva orden para claves iguales", () => {
    const original = items.map(i => ({ ...i }));
    const sorted = sortInventoryItems(items, "quantity-asc");
    expect(items).toEqual(original);
    expect(sorted).not.toBe(items);
    const first = items[0];
    const ties = [{ ...first, id: 1 }, { ...first, id: 2 }];
    expect(sortInventoryItems(ties, "quantity-asc").map(i => i.id)).toEqual([1, 2]);
  });
});
import { describe, it, expect, vi } from "vitest";
import { sortInventoryItems } from "./inventorySort";
import { applyMovement, balanceFromMovements, ZERO_BALANCE, type BalanceMovement } from "./inventoryBalanceAsOf";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

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

describe("saldos de inventario con existencia negativa", () => {
  const movement = (id: number, type: BalanceMovement["movement_type"], quantity: number, unitCost: number, direction: BalanceMovement["adjustment_direction"] = null): BalanceMovement => ({
    id, item_id: 1, movement_type: type, quantity, unit_cost: unitCost,
    adjustment_direction: direction, movement_date: "2026-10-26",
  });
  const sequence = [
    movement(1, "entrada", 5, 10),
    movement(2, "salida", 8, 10),
    movement(3, "entrada", 4, 12),
    movement(4, "ajuste", 3, 12, "negativo"),
  ];
  it("la salida superior a la existencia conserva el costo vigente", () => {
    expect(balanceFromMovements(sequence.slice(0, 2))).toEqual({ quantity: -3, unitCost: 10, value: -30 });
  });
  it("la entrada con saldo previo negativo fija el costo de la entrada", () => {
    expect(balanceFromMovements(sequence.slice(0, 3))).toEqual({ quantity: 1, unitCost: 12, value: 12 });
  });
  it("el ajuste negativo conserva saldo y valorización negativos", () => {
    expect(balanceFromMovements(sequence)).toEqual({ quantity: -2, unitCost: 12, value: -24 });
  });
  it("la entrada con saldo cero fija su costo", () => {
    expect(applyMovement(ZERO_BALANCE, movement(1, "entrada", 5, 10))).toEqual({ quantity: 5, unitCost: 10, value: 50 });
  });
  it("la entrada con saldo positivo usa promedio ponderado", () => {
    expect(applyMovement({ quantity: 5, unitCost: 10, value: 50 }, movement(2, "entrada", 5, 12)))
      .toEqual({ quantity: 10, unitCost: 11, value: 110 });
  });
});
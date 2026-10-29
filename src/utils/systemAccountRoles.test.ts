import { describe, it, expect } from "vitest";
import { collectSystemAccountRoles, findBlockingSystemAccounts } from "./systemAccountRoles";

const empty = { config: null, assetCategories: [], bankAccounts: [] };

describe("collectSystemAccountRoles", () => {
  it("una cuenta acumula dos roles de configuración", () => {
    const m = collectSystemAccountRoles({ ...empty, config: { vat_credit_account_id: 5, purchases_account_id: 5 } });
    expect(m.get(5)).toEqual(["Compras", "IVA crédito fiscal"]);
  });
  it("ignora ids nulos o no numéricos", () => {
    const m = collectSystemAccountRoles({ ...empty, config: { sales_account_id: null, customers_account_id: "7" } });
    expect(m.size).toBe(0);
  });
  it("ignora columnas que no son de cuentas", () => {
    const m = collectSystemAccountRoles({ ...empty, config: { id: 1, enterprise_id: 2, cost_of_sales_method: 3 } });
    expect(m.size).toBe(0);
  });
  it("columna desconocida usa la etiqueta de respaldo", () => {
    const m = collectSystemAccountRoles({ ...empty, config: { nuevo_account_id: 9 } });
    expect(m.get(9)).toEqual(["Configuración: nuevo account"]);
  });
  it("categorías de activos fijos con su nombre", () => {
    const m = collectSystemAccountRoles({
      ...empty,
      assetCategories: [{ name: "Vehículos", asset_account_id: 1, accumulated_depreciation_account_id: 2, depreciation_expense_account_id: 3, gain_loss_on_disposal_account_id: null }],
    });
    expect(m.get(1)).toEqual(["Activo fijo (Vehículos)"]);
    expect(m.get(2)).toEqual(["Depreciación acumulada (Vehículos)"]);
    expect(m.get(3)).toEqual(["Gasto por depreciación (Vehículos)"]);
    expect(m.size).toBe(3);
  });
  it("cuenta bancaria con nombre y número", () => {
    const m = collectSystemAccountRoles({ ...empty, bankAccounts: [{ account_id: 4, bank_name: "BI", account_number: "123" }, { account_id: 8, bank_name: null, account_number: "9" }] });
    expect(m.get(4)).toEqual(["Cuenta bancaria: BI 123"]);
    expect(m.get(8)).toEqual(["Cuenta bancaria:  9"]);
  });
});

describe("findBlockingSystemAccounts", () => {
  it("devuelve solo los ids presentes", () => {
    const roles = new Map([[2, ["Ventas"]], [5, ["Compras"]]]);
    expect(findBlockingSystemAccounts([1, 2, 3, 5], roles)).toEqual([2, 5]);
  });
});

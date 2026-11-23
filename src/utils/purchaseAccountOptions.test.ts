import { describe, it, expect } from "vitest";
import {
  isLikelyFixedAssetAccount,
  buildAssetAccountOptions,
  getPurchaseAccountOptions,
  getAccountLookup,
  type AccountOption,
} from "./purchaseAccountOptions";

const a = (id: number, code: string, name: string): AccountOption => ({ id, account_code: code, account_name: name });

describe("isLikelyFixedAssetAccount", () => {
  it("acepta cuentas de activo fijo", () => {
    expect(isLikelyFixedAssetAccount("120202", "Mobiliario y Equipo")).toBe(true);
    expect(isLikelyFixedAssetAccount("1.2.01", "Vehículos")).toBe(true);
    expect(isLikelyFixedAssetAccount("12", "Activo no corriente")).toBe(true);
  });
  it("rechaza depreciaciones y otras cuentas", () => {
    expect(isLikelyFixedAssetAccount("120211", "Depreciación Acumulada Inmuebles")).toBe(false);
    expect(isLikelyFixedAssetAccount("120220", "Depreciación acumulada útiles y enseres")).toBe(false);
    expect(isLikelyFixedAssetAccount("110301", "Mercaderías")).toBe(false);
    expect(isLikelyFixedAssetAccount("510216", "Gastos")).toBe(false);
  });
});

describe("buildAssetAccountOptions", () => {
  const movement = [
    a(4, "120203", "Vehículos"),
    a(1, "1305", "Equipo en tránsito"),
    a(2, "120211", "Depreciación Acumulada"),
    a(3, "120202", "Mobiliario y Equipo"),
    a(5, "510216", "Gastos"),
  ];
  it("une categoría y patrón sin repetir, ordenado y sin depreciaciones", () => {
    const res = buildAssetAccountOptions({ movementAccounts: movement, categoryAssetAccountIds: [1, 3] });
    expect(res.map((r) => r.account_code)).toEqual(["120202", "120203", "1305"]);
  });
});

describe("getPurchaseAccountOptions", () => {
  const expense = [a(10, "510101", "Papelería"), a(11, "610101", "Costo")];
  const asset = [a(20, "120202", "Mobiliario"), a(21, "120203", "Vehículos")];
  it("ACTIVOS_FIJOS devuelve cuentas de activo", () => {
    expect(getPurchaseAccountOptions({ operationTypeCode: "ACTIVOS_FIJOS", expenseAccounts: expense, assetAccounts: asset, selectedAccountId: null })).toEqual(asset);
  });
  it("otros tipos o sin tipo devuelven gastos", () => {
    for (const code of ["COMBUSTIBLE", "BIENES", null]) {
      expect(getPurchaseAccountOptions({ operationTypeCode: code, expenseAccounts: expense, assetAccounts: asset, selectedAccountId: null })).toEqual(expense);
    }
  });
  it("ACTIVOS_FIJOS sin cuentas de activo devuelve gastos", () => {
    expect(getPurchaseAccountOptions({ operationTypeCode: "ACTIVOS_FIJOS", expenseAccounts: expense, assetAccounts: [], selectedAccountId: null })).toEqual(expense);
  });
  it("agrega la cuenta seleccionada fuera de la base sin duplicar", () => {
    const res = getPurchaseAccountOptions({ operationTypeCode: "BIENES", expenseAccounts: expense, assetAccounts: asset, selectedAccountId: 20 });
    expect(res.map((r) => r.id)).toEqual([20, 10, 11]);
    const res2 = getPurchaseAccountOptions({ operationTypeCode: "BIENES", expenseAccounts: expense, assetAccounts: asset, selectedAccountId: 10 });
    expect(res2).toEqual(expense);
    const res3 = getPurchaseAccountOptions({ operationTypeCode: "BIENES", expenseAccounts: expense, assetAccounts: asset, selectedAccountId: 999 });
    expect(res3).toEqual(expense);
  });
});

describe("getAccountLookup", () => {
  it("une sin repetidos", () => {
    const res = getAccountLookup([a(1, "5", "x"), a(2, "12", "y")], [a(2, "12", "y"), a(3, "1202", "z")]);
    expect(res.map((r) => r.id).sort()).toEqual([1, 2, 3]);
  });
});

import { describe, it, expect } from "vitest";
import type { ReportLine } from "@/components/reportes/reportTypes";
import { findPercentBase, percentOfBase, formatPercent, variationPercentBases, variationPercentBase } from "./commonSize";
import { toSteppedExcelData } from "@/components/reportes/SteppedReportView";

describe("percentOfBase", () => {
  it("calcula 50 sobre 200 como 25%", () => expect(percentOfBase(50, 200)).toBe(25));
  it("rechaza base cero", () => expect(percentOfBase(50, 0)).toBeNull());
  it("rechaza base nula", () => expect(percentOfBase(50, null)).toBeNull());
  it("rechaza base indefinida", () => expect(percentOfBase(50, undefined)).toBeNull());
  it("usa el valor absoluto de una base negativa", () => expect(percentOfBase(50, -200)).toBe(25));
  it("conserva el signo del monto", () => expect(percentOfBase(-50, -200)).toBe(-25));
  it("rechaza bases inferiores a 0.005", () => expect(percentOfBase(1, -0.0049)).toBeNull());
  it("acepta el límite 0.005", () => expect(percentOfBase(0.005, 0.005)).toBe(100));
});

describe("formatPercent", () => {
  it("redondea con un decimal", () => expect(formatPercent(12.34)).toBe("12.3%"));
  it("formatea negativos", () => expect(formatPercent(-4.5)).toBe("-4.5%"));
  it("indica ausencia de base", () => expect(formatPercent(null)).toBe("—"));
});

describe("findPercentBase", () => {
  const results: ReportLine[] = [
    { type: "section", label: "INGRESOS", amount: 0 },
    { type: "account", label: "Ventas", amount: 200, level: 1 },
    { type: "subtotal", label: "Total Ingrésos", amount: 250 },
    { type: "section", label: "COSTOS", amount: 0 },
    { type: "account", label: "Costo", amount: -50, level: 1 },
  ];
  it("prioriza TOTAL INGRESOS normalizado", () => {
    expect(findPercentBase(results, "resultados")).toEqual({ amount: 250, label: "Total Ingrésos" });
  });
  it("usa solo cuentas nivel 1 de la primera sección de ventas", () => {
    const lines: ReportLine[] = [
      { type: "section", label: "VENTAS", amount: 0 },
      { type: "account", label: "Raíz 1", amount: 200, level: 1 },
      { type: "account", label: "Hija", amount: 200, level: 2 },
      { type: "account", label: "Raíz 2", amount: 50, level: 1 },
      { type: "section", label: "OTROS INGRESOS", amount: 0 },
      { type: "account", label: "Otra raíz", amount: 70, level: 1 },
    ];
    expect(findPercentBase(lines, "resultados")).toEqual({ amount: 250, label: "VENTAS" });
  });
  it("prioriza TOTAL ACTIVO sobre otros totales", () => {
    const lines: ReportLine[] = [
      { type: "total", label: "TOTAL PASIVO", amount: 80 },
      { type: "total", label: "TOTAL ACTIVO", amount: 200 },
    ];
    expect(findPercentBase(lines, "balance")).toEqual({ amount: 200, label: "TOTAL ACTIVO" });
  });
  it("usa el primer total como respaldo de balance", () => {
    expect(findPercentBase([{ type: "total", label: "Total", amount: 123 }], "balance"))
      .toEqual({ amount: 123, label: "Total" });
  });
  it("devuelve null en resultados sin sección ni subtotal base", () => {
    expect(findPercentBase([{ type: "account", label: "Cuenta", amount: 10, level: 1 }], "resultados")).toBeNull();
  });
  it("devuelve null si la sección no tiene cuentas nivel 1", () => {
    expect(findPercentBase([{ type: "section", label: "INGRESOS", amount: 0 }], "resultados")).toBeNull();
  });
  it("devuelve null en balance sin total", () => expect(findPercentBase(results, "balance")).toBeNull());
});

describe("porcentajes de Variaciones", () => {
  const bases = variationPercentBases([
    { accountType: 'activo', currentBalance: 150, comparedBalance: 50 },
    { accountType: 'activo', currentBalance: 50, comparedBalance: 50 },
    { accountType: 'ingreso', currentBalance: -400, comparedBalance: 200 },
    { accountType: 'pasivo', currentBalance: 900, comparedBalance: 700 },
    { accountType: 'gasto', currentBalance: 800, comparedBalance: 300 },
  ]);
  it("suma todas las raíces de activo e ingreso sin sumar otros tipos", () => {
    expect(bases).toEqual({ balance: { cur: 200, cmp: 100 }, resultados: { cur: -400, cmp: 200 } });
  });
  for (const type of ['activo', 'pasivo', 'capital']) {
    it(`${type} usa Total Activo en cada fecha`, () => {
      expect(variationPercentBase(bases, type, 'cur')).toBe(200);
      expect(variationPercentBase(bases, type, 'cmp')).toBe(100);
    });
  }
  for (const type of ['ingreso', 'costo', 'gasto']) {
    it(`${type} usa Total Ingresos en cada fecha`, () => {
      expect(variationPercentBase(bases, type, 'cur')).toBe(-400);
      expect(variationPercentBase(bases, type, 'cmp')).toBe(200);
    });
  }
  it("una raíz filtrada no pasa a 100% y conserva bases por fecha", () => {
    expect(percentOfBase(50, variationPercentBase(bases, 'activo', 'cur'))).toBe(25);
    expect(percentOfBase(50, variationPercentBase(bases, 'activo', 'cmp'))).toBe(50);
  });
  it("base cero se muestra sin porcentaje", () => {
    expect(formatPercent(percentOfBase(50, variationPercentBase(variationPercentBases([]), 'activo', 'cur')))).toBe('—');
  });
});

describe("Excel escalonado", () => {
  const lines: ReportLine[] = [
    { type: 'section', label: 'INGRESOS', amount: 0 },
    { type: 'account', label: 'Ventas', amount: 50, accountLevel: 1 },
    { type: 'subtotal', label: 'TOTAL INGRESOS', amount: 200 },
  ];
  it("apagado conserva datos y columnas sin porcentaje", () => {
    expect(toSteppedExcelData(lines)).toEqual({ headers: ['Concepto', 'Nivel 1'], data: [['INGRESOS', ''], ['  Ventas', 'Q 50.00'], ['TOTAL INGRESOS', 'Q 200.00']] });
  });
  it("encendido agrega porcentajes y deja secciones vacías", () => {
    expect(toSteppedExcelData(lines, undefined, 200).data).toEqual([['INGRESOS', '', ''], ['  Ventas', 'Q 50.00', '25.0%'], ['TOTAL INGRESOS', 'Q 200.00', '100.0%']]);
  });
});
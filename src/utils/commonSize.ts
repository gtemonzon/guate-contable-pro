import type { ReportLine } from "@/components/reportes/reportTypes";

const normalize = (label: string) =>
  label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export function findPercentBase(lines: ReportLine[], kind: "resultados" | "balance"): { amount: number; label: string } | null {
  if (kind === "balance") {
    const total = lines.find(line => line.type === "total" && normalize(line.label).includes("TOTAL ACTIVO"))
      ?? lines.find(line => line.type === "total");
    return total ? { amount: total.amount, label: total.label } : null;
  }
  const total = lines.find(line => line.type === "subtotal" && normalize(line.label) === "TOTAL INGRESOS");
  if (total) return { amount: total.amount, label: total.label };
  const sectionIndex = lines.findIndex(line => line.type === "section" && /INGRESO|VENTA/.test(normalize(line.label)));
  if (sectionIndex < 0) return null;
  const accounts: ReportLine[] = [];
  for (let i = sectionIndex + 1; i < lines.length && lines[i].type === "account"; i++) {
    if (lines[i].level === 1) accounts.push(lines[i]);
  }
  return accounts.length > 0
    ? { amount: accounts.reduce((sum, line) => sum + line.amount, 0), label: lines[sectionIndex].label }
    : null;
}

export function percentOfBase(amount: number, base: number | null | undefined): number | null {
  return base == null || Math.abs(base) < 0.005 ? null : amount / Math.abs(base) * 100;
}

export function formatPercent(p: number | null): string {
  return p === null ? "—" : `${p.toLocaleString("es-GT", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })}%`;
}

export interface VariationPercentBases {
  balance: { cur: number; cmp: number };
  resultados: { cur: number; cmp: number };
}

export function variationPercentBases(roots: { accountType: string; currentBalance: number; comparedBalance: number }[]): VariationPercentBases {
  const bases: VariationPercentBases = { balance: { cur: 0, cmp: 0 }, resultados: { cur: 0, cmp: 0 } };
  for (const root of roots) {
    const target = root.accountType === 'activo' ? bases.balance
      : root.accountType === 'ingreso' ? bases.resultados : null;
    if (target) {
      target.cur += root.currentBalance;
      target.cmp += root.comparedBalance;
    }
  }
  return bases;
}

export function variationPercentBase(bases: VariationPercentBases, accountType: string, date: "cur" | "cmp"): number | null {
  return ['activo', 'pasivo', 'capital'].includes(accountType) ? bases.balance[date]
    : ['ingreso', 'costo', 'gasto'].includes(accountType) ? bases.resultados[date] : null;
}
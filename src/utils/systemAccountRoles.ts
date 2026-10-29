// ============= systemAccountRoles =============
// Roles con que el sistema usa cada cuenta (configuración de la empresa,
// categorías de activos fijos y cuentas bancarias). Utilidad pura.

export const CONFIG_ACCOUNT_ROLE_LABELS: Record<string, string> = {
  cost_of_sales_account_id: "Costo de ventas",
  customers_account_id: "Clientes",
  final_inventory_account_id: "Inventario final",
  initial_inventory_account_id: "Inventario inicial",
  inventory_account_id: "Inventario",
  payroll_aguinaldo_bono14_provision_account_id: "Planilla: provisión de aguinaldo y bono 14",
  payroll_aguinaldo_expense_account_id: "Planilla: gasto de aguinaldo",
  payroll_bonificacion_expense_account_id: "Planilla: gasto de bonificación",
  payroll_bono14_expense_account_id: "Planilla: gasto de bono 14",
  payroll_igss_patronal_expense_account_id: "Planilla: gasto de IGSS patronal",
  payroll_igss_payable_account_id: "Planilla: IGSS por pagar",
  payroll_indemnizacion_expense_account_id: "Planilla: gasto de indemnización",
  payroll_indemnizacion_provision_account_id: "Planilla: provisión de indemnización",
  payroll_isr_payable_account_id: "Planilla: ISR por pagar",
  payroll_salaries_expense_account_id: "Planilla: gasto de sueldos",
  payroll_salaries_payable_account_id: "Planilla: sueldos por pagar",
  payroll_vacaciones_expense_account_id: "Planilla: gasto de vacaciones",
  period_result_account_id: "Resultado del período",
  purchases_account_id: "Compras",
  realized_fx_gain_account_id: "Ganancia cambiaria realizada",
  realized_fx_loss_account_id: "Pérdida cambiaria realizada",
  retained_earnings_account_id: "Utilidades retenidas",
  sales_account_id: "Ventas",
  small_taxpayer_tax_expense_account_id: "Gasto del impuesto de pequeño contribuyente",
  suppliers_account_id: "Proveedores",
  unrealized_fx_gain_account_id: "Ganancia cambiaria no realizada",
  unrealized_fx_loss_account_id: "Pérdida cambiaria no realizada",
  vat_credit_account_id: "IVA crédito fiscal",
  vat_debit_account_id: "IVA débito fiscal",
  account_isr_retained_payable_id: "ISR retenido por pagar",
  account_isr_retained_receivable_id: "ISR retenido por cobrar",
  account_non_vat_electricity_id: "No afecto: electricidad",
  account_non_vat_fiscal_stamp_id: "No afecto: timbre fiscal",
  account_non_vat_idp_id: "No afecto: IDP",
  account_non_vat_other_id: "No afecto: otros",
  account_non_vat_tourism_id: "No afecto: turismo",
  account_vat_exemption_control_id: "Control de exención de IVA",
  account_vat_retained_payable_id: "IVA retenido por pagar",
  account_vat_retained_receivable_id: "IVA retenido por cobrar",
};

export const FIXED_ASSET_ROLE_LABELS: Record<string, string> = {
  asset_account_id: "Activo fijo",
  accumulated_depreciation_account_id: "Depreciación acumulada",
  depreciation_expense_account_id: "Gasto por depreciación",
  gain_loss_on_disposal_account_id: "Ganancia o pérdida por baja",
};

export interface SystemAccountRolesInput {
  config: Record<string, unknown> | null;
  assetCategories: Array<Record<string, unknown>>;
  bankAccounts: Array<{ account_id: number | null; bank_name: string | null; account_number: string | null }>;
}

const asId = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function fallbackLabel(column: string): string {
  return `Configuración: ${column.replace(/_id$/, "").replace(/_/g, " ").trim()}`;
}

export function collectSystemAccountRoles(input: SystemAccountRolesInput): Map<number, string[]> {
  const sets = new Map<number, Set<string>>();
  const add = (id: number | null, role: string) => {
    if (id == null) return;
    const set = sets.get(id) ?? new Set<string>();
    set.add(role);
    sets.set(id, set);
  };

  if (input.config) {
    for (const [col, value] of Object.entries(input.config)) {
      if (!col.includes("account") || !col.endsWith("_id")) continue;
      add(asId(value), CONFIG_ACCOUNT_ROLE_LABELS[col] ?? fallbackLabel(col));
    }
  }
  for (const cat of input.assetCategories) {
    const name = typeof cat.name === "string" ? cat.name : "";
    for (const [col, label] of Object.entries(FIXED_ASSET_ROLE_LABELS)) {
      add(asId(cat[col]), `${label} (${name})`);
    }
  }
  for (const bank of input.bankAccounts) {
    add(asId(bank.account_id), `Cuenta bancaria: ${bank.bank_name ?? ""} ${bank.account_number ?? ""}`.trim());
  }

  const out = new Map<number, string[]>();
  for (const [id, set] of sets) out.set(id, [...set].sort((a, b) => a.localeCompare(b, "es")));
  return out;
}

export function findBlockingSystemAccounts(accountIds: number[], roles: Map<number, string[]>): number[] {
  return accountIds.filter((id) => roles.has(id));
}

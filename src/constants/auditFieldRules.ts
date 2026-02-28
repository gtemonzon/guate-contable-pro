/**
 * Audit Field Rules
 *
 * Central configuration that classifies every tracked table's columns
 * into *meaningful* (user-editable, business-relevant) vs *system*
 * (auto-computed, timestamps, internal flags).
 *
 * The UI uses this to:
 *  - Generate human-readable change summaries.
 *  - Separate "what the user did" from "what the system recalculated".
 *  - Hide noise in the default view.
 */

// ── Global ignored fields (apply to ALL tables) ─────────────────────
export const GLOBAL_IGNORED_FIELDS: readonly string[] = [
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
  "deleted_by",
  "created_by",
  "updated_by",
  "last_activity_at",
  "last_activity",
  "current_enterprise_name",
  "read_at",
  "uploaded_at",
  "uploaded_by",
  "closed_at",
  "closed_by",
  "reviewed_at",
  "reviewed_by",
  "posted_at",
  "tenant_id",
  "enterprise_id",
];

// ── Per-table: system / computed fields (shown collapsed) ───────────
export const SYSTEM_FIELDS_BY_TABLE: Record<string, readonly string[]> = {
  tab_journal_entries: [
    "total_debit",
    "total_credit",
    "is_posted",
    "modified_by",
    "entry_number",      // auto-allocated
  ],
  tab_purchase_ledger: [
    "net_amount",
    "vat_amount",
    "supplier_nit",      // normalised copy
    "journal_entry_id",  // set by link trigger
  ],
  tab_sales_ledger: [
    "net_amount",
    "vat_amount",
    "is_annulled",
  ],
  tab_accounts: [
    "level",
  ],
  tab_user_enterprises: [],
  tab_enterprises: [],
  tab_accounting_periods: [],
  tab_users: [
    "is_super_admin",
    "is_tenant_admin",
  ],
};

// ── Human-readable field labels ─────────────────────────────────────
export const FIELD_LABELS: Record<string, string> = {
  // common
  is_active: "Activo",
  status: "Estado",
  description: "Descripción",
  notes: "Notas",

  // enterprises
  business_name: "Razón Social",
  trade_name: "Nombre Comercial",
  nit: "NIT",
  tax_regime: "Régimen Fiscal",
  address: "Dirección",
  phone: "Teléfono",
  email: "Correo Electrónico",
  base_currency_code: "Moneda Base",

  // accounts
  account_code: "Código de Cuenta",
  account_name: "Nombre de Cuenta",
  account_type: "Tipo de Cuenta",
  balance_type: "Tipo de Saldo",
  allows_movement: "Permite Movimiento",
  is_bank_account: "Cuenta Bancaria",
  parent_account_id: "Cuenta Padre",

  // journal entries
  entry_date: "Fecha de Partida",
  entry_number: "Número de Partida",
  entry_type: "Tipo de Partida",
  total_debit: "Total Débito",
  total_credit: "Total Crédito",
  beneficiary_name: "Beneficiario",
  bank_reference: "Referencia Bancaria",
  document_reference: "Referencia Documento",
  accounting_period_id: "Período Contable",

  // purchases
  invoice_date: "Fecha de Factura",
  invoice_number: "Número de Factura",
  supplier_name: "Proveedor",
  supplier_nit: "NIT Proveedor",
  total_amount: "Monto Total",
  vat_amount: "IVA",
  net_amount: "Monto Neto",
  expense_account_id: "Cuenta de Gasto",
  operation_type_id: "Tipo de Operación",

  // sales
  customer_name: "Cliente",
  customer_nit: "NIT Cliente",

  // periods
  year: "Año",
  start_date: "Fecha Inicio",
  end_date: "Fecha Fin",

  // users
  full_name: "Nombre Completo",
  role: "Rol",
  is_super_admin: "Super Admin",
  is_tenant_admin: "Admin Tenant",
};

// ── Human-readable table labels ─────────────────────────────────────
export const TABLE_LABELS: Record<string, string> = {
  tab_enterprises: "Empresas",
  tab_users: "Usuarios",
  tab_accounts: "Cuentas Contables",
  tab_journal_entries: "Partidas",
  tab_journal_entry_details: "Líneas de Partida",
  tab_sales_ledger: "Libro de Ventas",
  tab_purchase_ledger: "Libro de Compras",
  tab_accounting_periods: "Períodos Contables",
  tab_user_enterprises: "Asignaciones Usuario-Empresa",
  tab_bank_accounts: "Cuentas Bancarias",
  tab_bank_movements: "Movimientos Bancarios",
  tab_bank_documents: "Documentos Bancarios",
  tab_enterprise_config: "Configuración de Empresa",
  tab_enterprise_tax_config: "Config. Impuestos",
  tab_role_permissions: "Permisos de Rol",
  tab_alert_config: "Configuración de Alertas",
  fixed_assets: "Activos Fijos",
  fixed_asset_categories: "Categorías de Activos",
  fixed_asset_locations: "Ubicaciones de Activos",
  fixed_asset_custodians: "Custodios de Activos",
  fixed_asset_suppliers: "Proveedores de Activos",
  fixed_asset_policy: "Política de Depreciación",
};

// ── Human-readable action labels ────────────────────────────────────
export const ACTION_LABELS: Record<string, string> = {
  INSERT: "Creación",
  UPDATE: "Modificación",
  DELETE: "Eliminación",
};

// ── Helpers ─────────────────────────────────────────────────────────

/** Returns true if a field should be completely hidden from audit display. */
export function isIgnoredField(field: string): boolean {
  return (GLOBAL_IGNORED_FIELDS as readonly string[]).includes(field);
}

/** Returns true if a field is system/computed for the given table. */
export function isSystemField(tableName: string, field: string): boolean {
  const tableRules = SYSTEM_FIELDS_BY_TABLE[tableName];
  return tableRules ? tableRules.includes(field) : false;
}

/** Get a human-readable label for a field name. */
export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get a human-readable label for a table name. */
export function getTableLabel(tableName: string): string {
  return TABLE_LABELS[tableName] || tableName;
}

/**
 * Build a one-line human-readable summary of what changed.
 * Only considers meaningful fields (not ignored, not system).
 */
export function buildChangeSummary(
  action: string,
  tableName: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): string {
  const entityLabel = getTableLabel(tableName);

  if (action === "INSERT") {
    const identifier = extractIdentifier(newValues);
    return `Creación de ${entityLabel}${identifier}`;
  }

  if (action === "DELETE") {
    const identifier = extractIdentifier(oldValues);
    return `Eliminación de ${entityLabel}${identifier}`;
  }

  // UPDATE — list meaningful changed fields
  if (!oldValues || !newValues) return `Modificación en ${entityLabel}`;

  const meaningfulChanges: string[] = [];

  for (const key of Object.keys(newValues)) {
    if (isIgnoredField(key)) continue;
    if (isSystemField(tableName, key)) continue;

    const oldVal = oldValues[key];
    const newVal = newValues[key];
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    const label = getFieldLabel(key);
    meaningfulChanges.push(label);
  }

  if (meaningfulChanges.length === 0) {
    return `Actualización del sistema en ${entityLabel}`;
  }

  if (meaningfulChanges.length <= 3) {
    return `Cambio en ${meaningfulChanges.join(", ")}`;
  }

  return `Cambio en ${meaningfulChanges.slice(0, 2).join(", ")} y ${meaningfulChanges.length - 2} más`;
}

/** Extract a human identifier from a record for the summary line. */
function extractIdentifier(values: Record<string, unknown> | null): string {
  if (!values) return "";

  const candidates = [
    "business_name",
    "account_name",
    "full_name",
    "entry_number",
    "invoice_number",
    "name",
    "code",
    "email",
  ];

  for (const key of candidates) {
    if (values[key]) return ` — ${String(values[key])}`;
  }

  if (values.description) {
    const desc = String(values.description);
    return ` — ${desc.length > 40 ? desc.substring(0, 40) + "…" : desc}`;
  }

  return "";
}

export interface AuditFieldChange {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
  category: "meaningful" | "system";
}

/**
 * Categorise field changes for the detail dialog.
 * Filters out globally ignored fields and splits the rest into
 * meaningful vs system buckets.
 */
export function categoriseChanges(
  action: string,
  tableName: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): { meaningful: AuditFieldChange[]; system: AuditFieldChange[] } {
  const meaningful: AuditFieldChange[] = [];
  const system: AuditFieldChange[] = [];

  if (action === "INSERT") {
    for (const [key, value] of Object.entries(newValues || {})) {
      if (isIgnoredField(key)) continue;
      const cat = isSystemField(tableName, key) ? "system" : "meaningful";
      const change: AuditFieldChange = {
        field: key,
        label: getFieldLabel(key),
        oldValue: null,
        newValue: value,
        category: cat,
      };
      (cat === "meaningful" ? meaningful : system).push(change);
    }
    return { meaningful, system };
  }

  if (action === "DELETE") {
    for (const [key, value] of Object.entries(oldValues || {})) {
      if (isIgnoredField(key)) continue;
      const cat = isSystemField(tableName, key) ? "system" : "meaningful";
      const change: AuditFieldChange = {
        field: key,
        label: getFieldLabel(key),
        oldValue: value,
        newValue: null,
        category: cat,
      };
      (cat === "meaningful" ? meaningful : system).push(change);
    }
    return { meaningful, system };
  }

  // UPDATE
  const allKeys = new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ]);

  for (const key of allKeys) {
    if (isIgnoredField(key)) continue;

    const oldVal = oldValues?.[key];
    const newVal = newValues?.[key];
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    const cat = isSystemField(tableName, key) ? "system" : "meaningful";
    const change: AuditFieldChange = {
      field: key,
      label: getFieldLabel(key),
      oldValue: oldVal ?? null,
      newValue: newVal ?? null,
      category: cat,
    };
    (cat === "meaningful" ? meaningful : system).push(change);
  }

  return { meaningful, system };
}

/**
 * Returns true if the log entry represents a user-initiated action
 * (has at least one meaningful field change for UPDATEs).
 * INSERT/DELETE are always considered user actions.
 */
export function isUserAction(
  action: string,
  tableName: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): boolean {
  if (action !== "UPDATE") return true;
  const { meaningful } = categoriseChanges(action, tableName, oldValues, newValues);
  return meaningful.length > 0;
}

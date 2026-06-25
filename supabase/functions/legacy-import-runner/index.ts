// Edge function: ejecuta una importación de datos legado en background.
// Recibe { jobId } y procesa el job completo actualizando progreso en BD.
// Sobrevive al cierre del navegador del cliente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/legacy-import-runner`;

interface ParsedAccount {
  code: string;
  name: string;
  type: string;
  allowsMovement: boolean;
  legacyId?: string | number;
}
interface ParsedPurchase {
  date: string;
  series: string;
  number: string;
  felDocType: string;
  supplierNit: string;
  supplierName: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  /** Non-VAT (No afecto) portion. Unified field replacing legacy idpAmount. */
  exemptAmount?: number;
  /** Classification of the Non-VAT portion: IDP, TOURISM_TAX, etc. */
  taxCategory?: string | null;
  /** @deprecated Legacy payloads still send idpAmount; folded into exemptAmount on write. */
  idpAmount?: number;
  operationTypeCode: string;
  authorizationNumber?: string;
  legacyAccountId?: string | number;
}
interface ParsedSale {
  date: string;
  series: string;
  number: string;
  felDocType: string;
  customerNit: string;
  customerName: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  operationTypeCode?: string;
  legacyAccountId?: string | number;
  authorizationNumber?: string;
  branchCode?: string;
}
interface ParsedJournalLine {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}
interface ParsedJournalEntry {
  legacyId?: string | number;
  date: string;
  description: string;
  reference?: string;
  lines: ParsedJournalLine[];
}
interface ParsedAssetCategory {
  legacyId: string | number;
  code: string;
  name: string;
  legacyAccountId?: string | number;
}
interface ParsedFixedAsset {
  code: string;
  name: string;
  serial?: string;
  model?: string;
  characteristics?: string;
  acquisitionDate: string;
  inServiceDate?: string;
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  legacyCategoryId?: string | number;
  status: "ACTIVE" | "DISPOSED";
}
interface ParsedDataset {
  accounts: ParsedAccount[];
  purchases: ParsedPurchase[];
  sales: ParsedSale[];
  journalEntries: ParsedJournalEntry[];
  assetCategories: ParsedAssetCategory[];
  fixedAssets: ParsedFixedAsset[];
}

const CHUNK = 100; // lote de inserción (compras/ventas) — más pequeño para evitar statement timeout
const JOURNAL_SLICE = 10; // partidas por invocación para evitar timeouts
const DETAIL_CHUNK = 25;
const DELETE_BATCH = 250;
const CLEAR_DELETE_BATCH = 100;
const MAX_RUNTIME_MS = 50_000; // si nos acercamos al límite del runtime, encolar continuación
const CLEAR_MAX_RUNTIME_MS = 20_000; // el borrado cede más agresivamente para no chocar con timeouts

interface ImportResult {
  accountsCreated: number;
  periodsCreated: number;
  purchasesCreated: number;
  salesCreated: number;
  journalEntriesCreated: number;
  journalEntriesPosted: number;
  journalEntriesAsDraft: number;
  assetCategoriesCreated: number;
  fixedAssetsCreated: number;
  deletedTotal?: number;
  deletedByStep?: Record<string, number>;
  verifiedEmptyByStep?: Record<string, boolean>;
  tableStats?: Record<string, number>;
  importPlan?: ImportPlan;
}

interface ImportPlanTableDecision {
  tableKey: string;
  mode: "import" | "clear_then_import" | "skip";
}

interface ImportPlan {
  clearExisting?: boolean;
  decisions?: ImportPlanTableDecision[];
}

const EMPTY_RESULT: ImportResult = {
  accountsCreated: 0,
  periodsCreated: 0,
  purchasesCreated: 0,
  salesCreated: 0,
  journalEntriesCreated: 0,
  journalEntriesPosted: 0,
  journalEntriesAsDraft: 0,
  assetCategoriesCreated: 0,
  fixedAssetsCreated: 0,
  deletedTotal: 0,
  deletedByStep: {},
  verifiedEmptyByStep: {},
  tableStats: {},
};

const TABLE_LABELS: Record<string, string> = {
  accounts: "Cuentas",
  periods: "Períodos",
  purchaseBooks: "Libros de compras",
  purchases: "Compras",
  sales: "Ventas",
  journalEntries: "Partidas",
  assetCategories: "Categorías de activos",
  fixedAssets: "Activos fijos",
};

const TABLE_STAT_QUERIES = [
  { key: "accounts", table: "tab_accounts" },
  { key: "periods", table: "tab_accounting_periods" },
  { key: "purchaseBooks", table: "tab_purchase_books" },
  { key: "purchases", table: "tab_purchase_ledger" },
  { key: "sales", table: "tab_sales_ledger" },
  { key: "journalEntries", table: "tab_journal_entries" },
  { key: "fixedAssets", table: "fixed_assets" },
  { key: "assetCategories", table: "fixed_asset_categories" },
  { key: "inventoryClosings", table: "tab_period_inventory_closing" },
  { key: "purchaseJournalLinks", table: "tab_purchase_journal_links" },
] as const;

function normalizeImportPlan(plan: unknown): Required<ImportPlan> {
  const raw = plan && typeof plan === "object" ? (plan as ImportPlan) : {};
  return {
    clearExisting: raw.clearExisting !== false,
    decisions: Array.isArray(raw.decisions)
      ? raw.decisions.filter(
          (item): item is ImportPlanTableDecision =>
            !!item &&
            typeof item === "object" &&
            typeof item.tableKey === "string" &&
            ["import", "clear_then_import", "skip"].includes(
              (item as ImportPlanTableDecision).mode,
            ),
        )
      : [],
  };
}

function getDecisionForTable(
  plan: Required<ImportPlan>,
  tableKey: string,
): ImportPlanTableDecision["mode"] {
  return (
    plan.decisions.find((item) => item.tableKey === tableKey)?.mode ??
    (plan.clearExisting ? "clear_then_import" : "import")
  );
}

function isStatementTimeout(message: string) {
  return /statement timeout|canceling statement/i.test(message);
}

async function collectEnterpriseTableStats(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
) {
  const stats: Record<string, number> = {};
  await Promise.all(
    TABLE_STAT_QUERIES.map(async ({ key, table }) => {
      const { count } = await sb
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("enterprise_id", enterpriseId);
      stats[key] = count ?? 0;
    }),
  );
  return stats;
}

async function deleteIdsAdaptiveSimple(
  sb: ReturnType<typeof createClient>,
  table: string,
  ids: Array<string | number>,
  label: string,
): Promise<number> {
  if (!ids.length) return 0;
  const { error } = await sb
    .from(table)
    .delete()
    .in("id", ids as any);
  if (!error) return ids.length;
  if (isStatementTimeout(error.message) && ids.length > 1) {
    const mid = Math.floor(ids.length / 2);
    return (
      (await deleteIdsAdaptiveSimple(sb, table, ids.slice(0, mid), label)) +
      (await deleteIdsAdaptiveSimple(sb, table, ids.slice(mid), label))
    );
  }
  if (ids.length > 1) {
    let deleted = 0;
    for (const id of ids) {
      const { error: rowError } = await sb
        .from(table)
        .delete()
        .eq("id", id as any);
      if (rowError) throw new Error(`${label}: ${rowError.message}`);
      deleted += 1;
    }
    return deleted;
  }
  throw new Error(`${label}: ${error.message}`);
}

async function clearSimpleEnterpriseTable(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
  table: string,
  label: string,
  batchSize = 100,
): Promise<number> {
  let deleted = 0;
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select("id")
      .eq("enterprise_id", enterpriseId)
      .order("id", { ascending: true })
      .limit(batchSize);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data?.length) break;
    deleted += await deleteIdsAdaptiveSimple(
      sb,
      table,
      data.map((row: any) => row.id),
      label,
    );
  }
  return deleted;
}

async function clearAccountsTree(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
): Promise<number> {
  let deleted = 0;
  while (true) {
    const { data: accountRows, error } = await sb
      .from("tab_accounts")
      .select("id, parent_account_id")
      .eq("enterprise_id", enterpriseId);
    if (error) throw new Error(`catálogo de cuentas: ${error.message}`);
    if (!accountRows?.length) break;
    const parentIds = new Set(
      accountRows
        .map((row) => row.parent_account_id)
        .filter((id): id is number => typeof id === "number"),
    );
    const leafIds = accountRows
      .filter((row) => !parentIds.has(row.id))
      .slice(0, 100)
      .map((row) => row.id);
    if (!leafIds.length) break;
    deleted += await deleteIdsAdaptiveSimple(
      sb,
      "tab_accounts",
      leafIds,
      "catálogo de cuentas",
    );
  }
  return deleted;
}

async function clearRowsByForeignKey(
  sb: ReturnType<typeof createClient>,
  table: string,
  foreignKey: string,
  values: Array<string | number>,
  label: string,
): Promise<number> {
  let deleted = 0;
  while (values.length > 0) {
    const { data, error } = await sb
      .from(table)
      .select("id")
      .in(foreignKey, values as any)
      .limit(100);
    if (error) throw new Error(`${label}: ${error.message}`);
    if (!data?.length) break;
    deleted += await deleteIdsAdaptiveSimple(
      sb,
      table,
      data.map((row: any) => row.id),
      label,
    );
  }
  return deleted;
}

async function clearJournalEntriesForImport(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
) {
  let deleted = 0;
  while (true) {
    const { data: entries, error } = await sb
      .from("tab_journal_entries")
      .select("id")
      .eq("enterprise_id", enterpriseId)
      .order("id", { ascending: true })
      .limit(100);
    if (error) throw new Error(`partidas: ${error.message}`);
    if (!entries?.length) break;
    const ids = entries.map((row) => row.id);
    await clearRowsByForeignKey(
      sb,
      "tab_journal_entry_details",
      "journal_entry_id",
      ids,
      "detalles de partidas",
    );
    deleted += await deleteIdsAdaptiveSimple(
      sb,
      "tab_journal_entries",
      ids,
      "partidas",
    );
  }
  return deleted;
}

async function clearFixedAssetsForImport(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
) {
  let deleted = 0;
  while (true) {
    const { data: assets, error } = await sb
      .from("fixed_assets")
      .select("id")
      .eq("enterprise_id", enterpriseId)
      .order("id", { ascending: true })
      .limit(100);
    if (error) throw new Error(`activos fijos: ${error.message}`);
    if (!assets?.length) break;
    const ids = assets.map((row) => row.id);
    await clearRowsByForeignKey(
      sb,
      "fixed_asset_depreciation_schedule",
      "asset_id",
      ids,
      "depreciaciones de activos",
    );
    await clearRowsByForeignKey(
      sb,
      "fixed_asset_event_log",
      "asset_id",
      ids,
      "bitácora de activos",
    );
    deleted += await deleteIdsAdaptiveSimple(
      sb,
      "fixed_assets",
      ids,
      "activos fijos",
    );
  }
  return deleted;
}

async function clearPurchasesForImport(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
) {
  let deleted = 0;
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "tab_purchase_journal_links",
    "vínculos compra-partida",
  );
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "tab_purchase_ledger",
    "compras",
  );
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "tab_purchase_books",
    "libros de compras",
  );
  return deleted;
}

async function clearPeriodsAndAccountsDomainForImport(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
) {
  let deleted = 0;
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "tab_purchase_journal_links",
    "vínculos compra-partida",
  );
  deleted += await clearJournalEntriesForImport(sb, enterpriseId);
  deleted += await clearFixedAssetsForImport(sb, enterpriseId);
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "fixed_asset_categories",
    "categorías de activos",
  );
  deleted += await clearPurchasesForImport(sb, enterpriseId);
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "tab_sales_ledger",
    "ventas",
  );
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "tab_period_inventory_closing",
    "cierres de inventario por período",
  );
  deleted += await clearSimpleEnterpriseTable(
    sb,
    enterpriseId,
    "tab_accounting_periods",
    "períodos",
  );
  deleted += await clearAccountsTree(sb, enterpriseId);
  return deleted;
}

const HARD_RESET_PHASES = [
  {
    phaseKey: "purchase_journal_links_clear",
    label: "vínculos compra-partida",
    progressKey: "purchaseJournalLinks",
  },
  {
    phaseKey: "purchase_ledger_clear",
    label: "compras",
    progressKey: "purchases",
  },
  {
    phaseKey: "purchase_books_clear",
    label: "libros de compras",
    progressKey: "purchaseBooks",
  },
  {
    phaseKey: "journal_entry_details_clear",
    label: "detalles de partidas",
    progressKey: "journalEntryDetails",
  },
  {
    phaseKey: "journal_entries_clear",
    label: "partidas",
    progressKey: "journalEntries",
  },
  {
    phaseKey: "fixed_asset_depreciation_schedule_clear",
    label: "depreciaciones de activos",
    progressKey: "fixedAssetDepreciationSchedule",
  },
  {
    phaseKey: "fixed_asset_event_log_clear",
    label: "bitácora de activos",
    progressKey: "fixedAssetEventLog",
  },
  {
    phaseKey: "fixed_assets_clear",
    label: "activos fijos",
    progressKey: "fixedAssets",
  },
  {
    phaseKey: "asset_categories_clear",
    label: "categorías de activos",
    progressKey: "assetCategories",
  },
  {
    phaseKey: "sales_ledger_clear",
    label: "ventas",
    progressKey: "sales",
  },
  {
    phaseKey: "inventory_closings_clear",
    label: "cierres de inventario por período",
    progressKey: "inventoryClosings",
  },
  {
    phaseKey: "periods_clear",
    label: "períodos",
    progressKey: "periods",
  },
  {
    phaseKey: "accounts_clear",
    label: "cuentas",
    progressKey: "accounts",
  },
] as const;

const HARD_RESET_PHASE_BY_KEY = Object.fromEntries(
  HARD_RESET_PHASES.map((phase) => [phase.phaseKey, phase]),
) as Record<
  string,
  {
    phaseKey: string;
    label: string;
    progressKey: string;
  }
>;

const RESUMABLE_CLEAR_PHASES = [
  { phaseKey: "enterprise_config_detach_accounts", label: "configuración contable", progressKey: "enterpriseConfig", batchSize: 1 },
  { phaseKey: "journal_entries_detach_self_refs", label: "referencias internas de partidas", progressKey: "journalEntriesSelfRefs", batchSize: 250 },
  { phaseKey: "tab_purchase_journal_links", label: "vínculos compra-partida", progressKey: "purchaseJournalLinks", batchSize: 1000 },
  { phaseKey: "tab_journal_entry_history", label: "historial de partidas", progressKey: "journalEntryHistory", batchSize: 1000 },
  { phaseKey: "tab_journal_entry_metadata_changes", label: "metadatos de partidas", progressKey: "journalEntryMetadataChanges", batchSize: 1000 },
  { phaseKey: "tab_purchase_ledger", label: "compras", progressKey: "purchases", batchSize: 500 },
  { phaseKey: "tab_sales_ledger", label: "ventas", progressKey: "sales", batchSize: 500 },
  { phaseKey: "tab_purchase_books", label: "libros de compras", progressKey: "purchaseBooks", batchSize: 100 },
  { phaseKey: "tab_period_inventory_closing", label: "cierres de inventario", progressKey: "inventoryClosings", batchSize: 500 },
  { phaseKey: "tab_bank_movements", label: "movimientos bancarios", progressKey: "bankMovements", batchSize: 500 },
  { phaseKey: "tab_bank_documents", label: "documentos bancarios", progressKey: "bankDocuments", batchSize: 250 },
  { phaseKey: "tab_bank_reconciliations", label: "conciliaciones bancarias", progressKey: "bankReconciliations", batchSize: 250 },
  { phaseKey: "tab_bank_import_templates", label: "plantillas bancarias", progressKey: "bankImportTemplates", batchSize: 100 },
  { phaseKey: "tab_bank_accounts", label: "cuentas bancarias", progressKey: "bankAccounts", batchSize: 100 },
  { phaseKey: "fixed_asset_depreciation_schedule", label: "depreciaciones de activos", progressKey: "fixedAssetDepreciationSchedule", batchSize: 1000 },
  { phaseKey: "fixed_asset_event_log", label: "bitácora de activos", progressKey: "fixedAssetEventLog", batchSize: 1000 },
  { phaseKey: "fixed_assets", label: "activos fijos", progressKey: "fixedAssets", batchSize: 250 },
  { phaseKey: "fixed_asset_categories", label: "categorías de activos", progressKey: "assetCategories", batchSize: 100 },
  { phaseKey: "fixed_asset_locations", label: "ubicaciones de activos", progressKey: "assetLocations", batchSize: 100 },
  { phaseKey: "fixed_asset_custodians", label: "custodios de activos", progressKey: "assetCustodians", batchSize: 100 },
  { phaseKey: "fixed_asset_suppliers", label: "proveedores de activos", progressKey: "assetSuppliers", batchSize: 100 },
  { phaseKey: "fixed_asset_policy", label: "políticas de activos", progressKey: "assetPolicy", batchSize: 50 },
  { phaseKey: "tab_fx_settlements", label: "liquidaciones cambiarias", progressKey: "fxSettlements", batchSize: 250 },
  { phaseKey: "tab_fx_open_balances", label: "saldos abiertos en moneda extranjera", progressKey: "fxOpenBalances", batchSize: 250 },
  { phaseKey: "tab_fx_revaluation_runs", label: "corridas de revaluación cambiaria", progressKey: "fxRevaluationRuns", batchSize: 100 },
  { phaseKey: "tab_journal_entry_details", label: "detalles de partidas", progressKey: "journalEntryDetails", batchSize: 250 },
  { phaseKey: "tab_journal_entries", label: "partidas", progressKey: "journalEntries", batchSize: 25 },
  { phaseKey: "tab_integrity_validations", label: "validaciones de integridad", progressKey: "integrityValidations", batchSize: 100 },
  { phaseKey: "tab_accounting_periods", label: "períodos", progressKey: "periods", batchSize: 100 },
  { phaseKey: "tab_book_folio_consumption", label: "folios consumidos", progressKey: "bookFolioConsumption", batchSize: 100 },
  { phaseKey: "tab_book_authorizations", label: "autorizaciones de libros", progressKey: "bookAuthorizations", batchSize: 100 },
  { phaseKey: "tab_integrity_rules_config", label: "reglas de integridad", progressKey: "integrityRulesConfig", batchSize: 100 },
  { phaseKey: "tab_holidays", label: "feriados", progressKey: "holidays", batchSize: 100 },
  { phaseKey: "tab_tax_due_date_config", label: "configuración de vencimientos fiscales", progressKey: "taxDueDateConfig", batchSize: 100 },
  { phaseKey: "tab_alert_config", label: "alertas", progressKey: "alertConfig", batchSize: 100 },
  { phaseKey: "tab_custom_reminders", label: "recordatorios", progressKey: "customReminders", batchSize: 100 },
  { phaseKey: "tab_notifications", label: "notificaciones", progressKey: "notifications", batchSize: 250 },
  { phaseKey: "tab_role_permissions", label: "permisos por rol", progressKey: "rolePermissions", batchSize: 100 },
  { phaseKey: "tab_dashboard_card_config", label: "configuración del dashboard", progressKey: "dashboardCardConfig", batchSize: 100 },
  { phaseKey: "tab_backup_history", label: "historial de respaldos", progressKey: "backupHistory", batchSize: 100 },
  { phaseKey: "tab_operation_types", label: "tipos de operación", progressKey: "operationTypes", batchSize: 100 },
  { phaseKey: "tab_tax_forms", label: "formularios fiscales", progressKey: "taxForms", batchSize: 100 },
  { phaseKey: "tab_audit_log", label: "bitácora de auditoría", progressKey: "auditLog", batchSize: 1000 },
  { phaseKey: "tab_import_logs", label: "logs de importación", progressKey: "importLogs", batchSize: 100 },
  { phaseKey: "tab_exchange_rates", label: "tipos de cambio", progressKey: "exchangeRates", batchSize: 100 },
  { phaseKey: "tab_accounts", label: "cuentas", progressKey: "accounts", batchSize: 250 },
] as const;

async function runHardResetPhase(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
  phaseKey: string,
): Promise<{
  phase_key: string;
  table_name: string;
  deleted_count: number;
  remaining_count: number;
}> {
  const { data, error } = await sb.rpc("hard_reset_legacy_import_phase", {
    p_enterprise_id: enterpriseId,
    p_phase: phaseKey,
  });

  if (error) {
    throw new Error(`limpieza ${phaseKey}: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) {
    throw new Error(`limpieza ${phaseKey}: no devolvió resultado`);
  }

  return {
    phase_key: String(row.phase_key ?? phaseKey),
    table_name: String(row.table_name ?? phaseKey),
    deleted_count: Number(row.deleted_count ?? 0),
    remaining_count: Number(row.remaining_count ?? 0),
  };
}

async function runResumablePhaseUntilEmpty(
  sb: ReturnType<typeof createClient>,
  enterpriseId: number,
  phase: {
    phaseKey: string;
    label: string;
    progressKey: string;
    batchSize: number;
  },
  onProgress?: (remaining: number) => Promise<void>,
) {
  let deletedTotal = 0;
  let remaining = 0;
  let safetyIterations = 0;

  while (true) {
    safetyIterations += 1;
    if (safetyIterations > 5000) {
      throw new Error(`Fase ${phase.phaseKey} excedió el máximo de iteraciones`);
    }

    const { data, error } = await sb.rpc("clear_legacy_import_batch", {
      p_enterprise_id: enterpriseId,
      p_phase: phase.phaseKey.replace(/_clear$/, ""),
      p_batch_size: phase.batchSize,
    });

    if (error) {
      throw new Error(`limpieza ${phase.phaseKey}: ${error.message}`);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      throw new Error(`limpieza ${phase.phaseKey}: sin resultado del batch`);
    }

    deletedTotal += Number((row as any).deleted_count ?? 0);
    remaining = Number((row as any).remaining_count ?? 0);

    if (onProgress) {
      await onProgress(remaining);
    }

    if (Boolean((row as any).done)) {
      return { deleted_count: deletedTotal, remaining_count: remaining };
    }
  }
}

async function insertCriticalRows<T>(
  sb: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  label: string,
  batchSize = 25,
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const part = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(part as any);

    if (!error) {
      inserted += part.length;
      continue;
    }

    if (!isStatementTimeout(error.message) && part.length === 1) {
      throw new Error(`${label}: ${error.message}`);
    }

    for (const row of part) {
      const { error: rowError } = await sb.from(table).insert(row as any);
      if (rowError) {
        throw new Error(`${label}: ${rowError.message}`);
      }
      inserted += 1;
    }
  }

  return inserted;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function inferBalanceType(t: string): string {
  switch (t) {
    case "activo":
    case "gasto":
    case "costo":
      return "deudor";
    case "pasivo":
    case "capital":
    case "ingreso":
      return "acreedor";
    default:
      return "deudor";
  }
}

function extractYears(ds: ParsedDataset): number[] {
  const years = new Set<number>();
  const add = (d: string) => {
    const y = parseInt(d.slice(0, 4));
    if (y >= 1900 && y <= 2100) years.add(y);
  };
  ds.purchases.forEach((p) => add(p.date));
  ds.sales.forEach((s) => add(s.date));
  ds.journalEntries.forEach((j) => add(j.date));
  return Array.from(years).sort();
}

function mergeResult(existing: unknown): ImportResult {
  return {
    ...EMPTY_RESULT,
    ...(existing && typeof existing === "object"
      ? (existing as Partial<ImportResult>)
      : {}),
  };
}

function parseCompletedSteps(existing: unknown): Set<string> {
  return new Set(
    Array.isArray(existing)
      ? existing.filter((step) => typeof step === "string")
      : [],
  );
}

async function createAuthedClient(authHeader: string) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Error("No autorizado");
  }

  return { client, user: data.user };
}

async function queueContinuation(jobId: string) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ jobId }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo continuar la importación: ${body}`);
  }
}

async function queueClearContinuation(
  clearJobId: string,
  enterpriseId: number,
) {
  const response = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
      apikey: SERVICE_ROLE,
    },
    body: JSON.stringify({ action: "clear", enterpriseId, clearJobId }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo continuar el borrado: ${body}`);
  }
}

async function isJobStillActive(
  sb: ReturnType<typeof createClient>,
  jobId: string,
) {
  const { data } = await sb
    .from("tab_legacy_import_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  return !!data && (data.status === "pending" || data.status === "running");
}

// Soft time budget per invocation (ms). Edge function CPU limit is around 150s;
// stop earlier and queue a continuation to remain well within bounds.
const CLEAR_TIME_BUDGET_MS = 60_000;

async function runClear(clearJobId: string, enterpriseId: number) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const startedAt = Date.now();

  // Load existing job state to support resume
  const { data: jobRow } = await sb
    .from("tab_legacy_import_jobs")
    .select("result, payload, started_at")
    .eq("id", clearJobId)
    .maybeSingle();

  const previousResult: any =
    jobRow?.result && typeof jobRow.result === "object" ? jobRow.result : {};

  const clearResult: any = {
    deletedByStep: previousResult.deletedByStep ?? {},
    verifiedEmptyByStep: previousResult.verifiedEmptyByStep ?? {},
    tableStats: previousResult.tableStats ?? {},
    phaseTimings: previousResult.phaseTimings ?? {},
    completedPhases: Array.isArray(previousResult.completedPhases)
      ? [...previousResult.completedPhases]
      : [],
    deletedTotal: Number(previousResult.deletedTotal ?? 0),
    cleared: false,
  };

  const completedSet = new Set<string>(clearResult.completedPhases);

  const persist = async (patch: Record<string, unknown>) => {
    await sb
      .from("tab_legacy_import_jobs")
      .update({
        updated_at: new Date().toISOString(),
        ...patch,
      })
      .eq("id", clearJobId);
  };

  const isFirstRun = completedSet.size === 0;

  try {
    if (isFirstRun) {
      await persist({
        status: "running",
        started_at: jobRow?.started_at ?? new Date().toISOString(),
        current_step: "Cancelando trabajos previos...",
        current_count: 0,
        total_count: RESUMABLE_CLEAR_PHASES.length,
        result: clearResult,
      });

      // Cancel any other active jobs for this enterprise
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          status: "failed",
          error_message: "Cancelado por nuevo borrado.",
          finished_at: new Date().toISOString(),
        })
        .eq("enterprise_id", enterpriseId)
        .in("status", ["pending", "running"])
        .neq("id", clearJobId);
    } else {
      await persist({
        status: "running",
        current_step: "Reanudando borrado...",
        current_count: completedSet.size,
        total_count: RESUMABLE_CLEAR_PHASES.length,
        result: clearResult,
      });
    }

    for (let i = 0; i < RESUMABLE_CLEAR_PHASES.length; i++) {
      const phase = RESUMABLE_CLEAR_PHASES[i];
      if (completedSet.has(phase.phaseKey)) continue;

      // Time budget check: queue continuation if running long
      if (Date.now() - startedAt > CLEAR_TIME_BUDGET_MS) {
        clearResult.completedPhases = Array.from(completedSet);
        await persist({
          current_step: `Pausa para continuar: ${phase.label}`,
          current_count: completedSet.size,
          total_count: RESUMABLE_CLEAR_PHASES.length,
          result: clearResult,
        });
        await queueClearContinuation(clearJobId, enterpriseId);
        return;
      }

      let phaseDeleted = 0;
      let phaseMs = 0;
      let safetyIterations = 0;

      // Loop batches until the phase reports done=true
      while (true) {
        safetyIterations += 1;
        if (safetyIterations > 5000) {
          throw new Error(
            `Fase ${phase.phaseKey} excedió el máximo de iteraciones`,
          );
        }

        const phaseStart = Date.now();
        const { data, error } = await sb.rpc("clear_legacy_import_batch", {
          p_enterprise_id: enterpriseId,
          p_phase: phase.phaseKey,
          p_batch_size: phase.batchSize,
        });

        if (error) {
          throw new Error(`limpieza ${phase.phaseKey}: ${error.message}`);
        }

        const row = Array.isArray(data) ? data[0] : null;
        if (!row) {
          throw new Error(
            `limpieza ${phase.phaseKey}: sin resultado del batch`,
          );
        }

        const deleted = Number((row as any).deleted_count ?? 0);
        const remaining = Number((row as any).remaining_count ?? 0);
        const done = Boolean((row as any).done);
        const execMs = Number(
          (row as any).execution_ms ?? Date.now() - phaseStart,
        );

        phaseDeleted += deleted;
        phaseMs += execMs;

        clearResult.deletedByStep[phase.progressKey] =
          (clearResult.deletedByStep[phase.progressKey] ?? 0) + deleted;
        clearResult.tableStats[phase.phaseKey] = remaining;
        clearResult.verifiedEmptyByStep[phase.progressKey] = remaining === 0;

        await persist({
          current_step: `Borrando ${phase.label} (${remaining} restantes)`,
          current_count: completedSet.size,
          total_count: RESUMABLE_CLEAR_PHASES.length,
          result: clearResult,
        });

        if (done) break;

        // Mid-phase time check: continuation
        if (Date.now() - startedAt > CLEAR_TIME_BUDGET_MS) {
          clearResult.phaseTimings[phase.phaseKey] =
            (clearResult.phaseTimings[phase.phaseKey] ?? 0) + phaseMs;
          clearResult.deletedTotal += phaseDeleted;
          await persist({
            current_step: `Pausa en ${phase.label} (continúa)`,
            current_count: completedSet.size,
            total_count: RESUMABLE_CLEAR_PHASES.length,
            result: clearResult,
          });
          await queueClearContinuation(clearJobId, enterpriseId);
          return;
        }
      }

      completedSet.add(phase.phaseKey);
      clearResult.completedPhases = Array.from(completedSet);
      clearResult.deletedTotal += phaseDeleted;
      clearResult.phaseTimings[phase.phaseKey] =
        (clearResult.phaseTimings[phase.phaseKey] ?? 0) + phaseMs;

      console.log(
        `[clear] ${phase.phaseKey}: deleted=${phaseDeleted} ms=${phaseMs}`,
      );

      await persist({
        current_step: `${phase.label} completado`,
        current_count: completedSet.size,
        total_count: RESUMABLE_CLEAR_PHASES.length,
        result: clearResult,
      });
    }

    // Cleanup storage payloads (best-effort)
    try {
      const { data: payloadRows } = await sb
        .from("tab_legacy_import_jobs")
        .select("payload_path")
        .eq("enterprise_id", enterpriseId)
        .not("payload_path", "is", null);

      const payloadPaths = (payloadRows ?? [])
        .map((r: any) => r.payload_path)
        .filter((p: any): p is string => !!p);

      if (payloadPaths.length > 0) {
        await sb.storage.from("legacy-imports").remove(payloadPaths);
      }
    } catch (e) {
      console.warn("Payload cleanup warning:", e);
    }

    // Cleanup old job rows
    await sb
      .from("tab_legacy_import_jobs")
      .delete()
      .eq("enterprise_id", enterpriseId)
      .neq("id", clearJobId);

    clearResult.cleared = true;

    await sb
      .from("tab_legacy_import_jobs")
      .update({
        status: "completed",
        current_step: "Borrado completado",
        current_count: RESUMABLE_CLEAR_PHASES.length,
        total_count: RESUMABLE_CLEAR_PHASES.length,
        updated_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        result: clearResult,
      })
      .eq("id", clearJobId);
  } catch (err: any) {
    console.error("clear_legacy_import_batch failed", err);
    await sb
      .from("tab_legacy_import_jobs")
      .update({
        status: "failed",
        error_message: String(err?.message ?? err),
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result: clearResult,
      })
      .eq("id", clearJobId);
  }
}

async function runImport(jobId: string) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // Cargar job
  const { data: job, error: jobErr } = await sb
    .from("tab_legacy_import_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobErr || !job) {
    console.error("Job no encontrado", jobErr);
    return;
  }

  const enterpriseId: number = job.enterprise_id;
  const userId: string = job.created_by;

  // Cargar dataset: desde Storage (preferido) o desde columna payload (fallback)
  let ds: ParsedDataset;
  if (job.payload_path) {
    const { data: blob, error: dlErr } = await sb.storage
      .from("legacy-imports")
      .download(job.payload_path);
    if (dlErr || !blob) {
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          status: "failed",
          error_message: `No se pudo descargar el payload: ${dlErr?.message ?? "desconocido"}`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return;
    }
    ds = JSON.parse(await blob.text());
  } else {
    ds = job.payload;
  }

  const errors: string[] = Array.isArray(job.errors)
    ? job.errors.filter(
        (item: unknown): item is string => typeof item === "string",
      )
    : [];
  const result = mergeResult(job.result);
  const stepsCompleted = parseCompletedSteps(job.steps_completed);
  const importPlan = normalizeImportPlan(
    job.payload && typeof job.payload === "object"
      ? (job.payload as Record<string, unknown>).importPlan
      : undefined,
  );
  result.importPlan = importPlan;

  let lastUpdate = 0;
  const updateProgress = async (
    step: string,
    current: number,
    total: number,
    force = false,
  ) => {
    const now = Date.now();
    if (!force && now - lastUpdate < 800) return;
    lastUpdate = now;
    await sb
      .from("tab_legacy_import_jobs")
      .update({
        current_step: step,
        current_count: current,
        total_count: total,
        errors,
      })
      .eq("id", jobId);
  };

  const tableStats = await collectEnterpriseTableStats(sb, enterpriseId);
  result.tableStats = tableStats;

  await sb
    .from("tab_legacy_import_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      errors,
      result,
      steps_completed: Array.from(stepsCompleted),
    })
    .eq("id", jobId);

  if (!stepsCompleted.has("precheck")) {
    const blockingTables = [
      "accounts",
      "periods",
      "purchases",
      "sales",
      "journalEntries",
      "assetCategories",
      "fixedAssets",
    ].filter((key) => tableStats[key] > 0);

    for (const tableKey of blockingTables) {
      const mode = getDecisionForTable(importPlan, tableKey);
      if (mode === "skip") {
        stepsCompleted.add(`skip_${tableKey}`);
        continue;
      }
      if (mode === "import") {
        throw new Error(
          `${TABLE_LABELS[tableKey]}: ya existen ${tableStats[tableKey]} registros. Debes elegir borrar esa tabla o saltarla antes de importar.`,
        );
      }
    }

    stepsCompleted.add("precheck");
    await sb
      .from("tab_legacy_import_jobs")
      .update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      })
      .eq("id", jobId);
  }

  if (!stepsCompleted.has("preclear")) {
    const needsClear = (tableKey: string, count: number) =>
      count > 0 && getDecisionForTable(importPlan, tableKey) === "clear_then_import";

    const clearAccounts = needsClear("accounts", tableStats.accounts ?? 0);
    const clearPeriods = needsClear("periods", tableStats.periods ?? 0);
    const clearPurchases =
      needsClear("purchases", Math.max(tableStats.purchases ?? 0, tableStats.purchaseBooks ?? 0)) ||
      clearAccounts ||
      clearPeriods;
    const clearJournalEntries =
      needsClear("journalEntries", tableStats.journalEntries ?? 0) ||
      clearAccounts ||
      clearPeriods;
    const clearFixedAssets =
      needsClear("fixedAssets", tableStats.fixedAssets ?? 0) ||
      clearAccounts ||
      clearPeriods;
    const clearAssetCategories =
      needsClear("assetCategories", tableStats.assetCategories ?? 0) ||
      clearAccounts ||
      clearPeriods;
    const clearSales =
      needsClear("sales", tableStats.sales ?? 0) || clearAccounts || clearPeriods;
    const clearInventoryClosings = clearAccounts || clearPeriods;

    const dependentConflicts = [
      {
        key: "purchases",
        label: TABLE_LABELS.purchases,
        count: Math.max(tableStats.purchases ?? 0, tableStats.purchaseBooks ?? 0),
        required: clearAccounts || clearPeriods,
      },
      {
        key: "journalEntries",
        label: TABLE_LABELS.journalEntries,
        count: tableStats.journalEntries ?? 0,
        required: clearAccounts || clearPeriods,
      },
      {
        key: "sales",
        label: TABLE_LABELS.sales,
        count: tableStats.sales ?? 0,
        required: clearAccounts || clearPeriods,
      },
      {
        key: "fixedAssets",
        label: TABLE_LABELS.fixedAssets,
        count: tableStats.fixedAssets ?? 0,
        required: clearAccounts || clearPeriods,
      },
      {
        key: "assetCategories",
        label: TABLE_LABELS.assetCategories,
        count: tableStats.assetCategories ?? 0,
        required: clearAccounts || clearPeriods,
      },
    ].filter(
      (item) =>
        item.required &&
        item.count > 0 &&
        getDecisionForTable(importPlan, item.key) === "skip",
    );

    if (dependentConflicts.length > 0) {
      throw new Error(
        `No se puede borrar cuentas/períodos mientras saltas tablas dependientes: ${dependentConflicts
          .map((item) => item.label)
          .join(", ")}.`,
      );
    }

    const phasesToRun = HARD_RESET_PHASES.filter((phase) => {
      switch (phase.phaseKey) {
        case "purchase_journal_links_clear":
          return clearPurchases || clearJournalEntries;
        case "purchase_ledger_clear":
        case "purchase_books_clear":
          return clearPurchases;
        case "journal_entry_details_clear":
        case "journal_entries_clear":
          return clearJournalEntries;
        case "fixed_asset_depreciation_schedule_clear":
        case "fixed_asset_event_log_clear":
        case "fixed_assets_clear":
          return clearFixedAssets || clearAssetCategories;
        case "asset_categories_clear":
          return clearAssetCategories;
        case "sales_ledger_clear":
          return clearSales;
        case "inventory_closings_clear":
          return clearInventoryClosings;
        case "periods_clear":
          return clearPeriods;
        case "accounts_clear":
          return clearAccounts;
        default:
          return false;
      }
    });

    result.deletedByStep = result.deletedByStep ?? {};
    result.verifiedEmptyByStep = result.verifiedEmptyByStep ?? {};
    result.tableStats = result.tableStats ?? {};

    for (const phase of phasesToRun) {
      await updateProgress(`Limpiando ${phase.label} existentes...`, 0, 1, true);
      const row = await runResumablePhaseUntilEmpty(
        sb,
        enterpriseId,
        {
          phaseKey:
            phase.phaseKey === "purchase_journal_links_clear"
              ? "tab_purchase_journal_links"
              : phase.phaseKey === "purchase_ledger_clear"
                ? "tab_purchase_ledger"
                : phase.phaseKey === "purchase_books_clear"
                  ? "tab_purchase_books"
                  : phase.phaseKey === "journal_entry_details_clear"
                    ? "tab_journal_entry_details"
                    : phase.phaseKey === "journal_entries_clear"
                      ? "tab_journal_entries"
                      : phase.phaseKey === "fixed_asset_depreciation_schedule_clear"
                        ? "fixed_asset_depreciation_schedule"
                        : phase.phaseKey === "fixed_asset_event_log_clear"
                          ? "fixed_asset_event_log"
                          : phase.phaseKey === "fixed_assets_clear"
                            ? "fixed_assets"
                            : phase.phaseKey === "asset_categories_clear"
                              ? "fixed_asset_categories"
                              : phase.phaseKey === "sales_ledger_clear"
                                ? "tab_sales_ledger"
                                : phase.phaseKey === "inventory_closings_clear"
                                  ? "tab_period_inventory_closing"
                                  : phase.phaseKey === "periods_clear"
                                    ? "tab_accounting_periods"
                                    : "tab_accounts",
          label: phase.label,
          progressKey: phase.progressKey,
          batchSize:
            phase.phaseKey === "tab_accounts" || phase.phaseKey === "accounts_clear"
              ? 100
              : phase.phaseKey === "journal_entries_clear"
                ? 50
                : phase.phaseKey === "journal_entry_details_clear"
                  ? 250
                  : 100,
        },
        async (remaining) => {
          await updateProgress(
            `Limpiando ${phase.label} existentes...`,
            remaining > 0 ? 1 : 0,
            1,
            true,
          );
        },
      );
      result.deletedByStep[`preclear_${phase.phaseKey}`] = Number(
        row.deleted_count ?? 0,
      );
      result.verifiedEmptyByStep[`preclear_${phase.phaseKey}`] =
        Number(row.remaining_count ?? 0) === 0;
      result.tableStats[phase.progressKey] = Number(row.remaining_count ?? 0);
      result.deletedTotal = Object.values(result.deletedByStep).reduce(
        (sum, value) => sum + Number(value || 0),
        0,
      );

      if (Number(row.remaining_count ?? 0) > 0) {
        throw new Error(
          `${phase.label}: quedaron ${Number(row.remaining_count ?? 0)} registros tras la limpieza previa.`,
        );
      }
    }

    result.tableStats = await collectEnterpriseTableStats(sb, enterpriseId);
    const blockingRemaining = Object.entries(result.tableStats).filter(
      ([key, count]) => {
        const value = Number(count ?? 0);
        if (value <= 0) return false;
        if (["purchaseBooks", "purchases", "purchaseJournalLinks"].includes(key)) {
          return clearPurchases || clearJournalEntries;
        }
        if (["journalEntries"].includes(key)) return clearJournalEntries;
        if (["fixedAssets"].includes(key)) return clearFixedAssets || clearAssetCategories;
        if (["assetCategories"].includes(key)) return clearAssetCategories;
        if (["sales"].includes(key)) return clearSales;
        if (["inventoryClosings"].includes(key)) return clearInventoryClosings;
        if (["periods"].includes(key)) return clearPeriods;
        if (["accounts"].includes(key)) return clearAccounts;
        return false;
      },
    );

    if (blockingRemaining.length > 0) {
      throw new Error(
        `Quedaron remanentes tras la limpieza previa: ${blockingRemaining
          .map(([key, count]) => `${key}=${count}`)
          .join(", ")}`,
      );
    }

    stepsCompleted.add("preclear");
    await sb
      .from("tab_legacy_import_jobs")
      .update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      })
      .eq("id", jobId);
  }

  try {
    // ---------- 1. Cuentas ----------
    const levelByLen = (len: number) =>
      len === 8 ? 5 : len === 6 ? 4 : len === 4 ? 3 : len === 2 ? 2 : 1;
    const accountRows = ds.accounts.map((a) => ({
      enterprise_id: enterpriseId,
      account_code: a.code,
      account_name: a.name,
      account_type: a.type,
      level: levelByLen(a.code.length),
      allows_movement: a.code.length >= 6,
      requires_cost_center: false,
      is_active: true,
      balance_type: inferBalanceType(a.type),
      is_bank_account: false,
      is_monetary: false,
    }));
    if (
      !stepsCompleted.has("accounts") &&
      !stepsCompleted.has("skip_accounts")
    ) {
      await updateProgress(
        "Insertando cuentas...",
        0,
        ds.accounts.length,
        true,
      );
      // Usar RPC bulk_insert_accounts: activa app.import_mode dentro de la
      // misma transacción para evitar el seq scan en audit_event_log que
      // disparaban los triggers de auditoría en cada insert (causa real del
      // statement timeout). Inserta las 178 cuentas en una sola sentencia.
      const { data: insertedCount, error: bulkErr } = await sb.rpc(
        "bulk_insert_accounts",
        {
          p_enterprise_id: enterpriseId,
          p_accounts: accountRows as any,
        },
      );
      if (bulkErr) throw new Error(`Cuentas: ${bulkErr.message}`);
      result.accountsCreated = Number(insertedCount ?? accountRows.length);
      await updateProgress(
        "Insertando cuentas...",
        result.accountsCreated,
        accountRows.length,
      );

      const { error: linkErr } = await sb.rpc("link_account_parents_by_code", {
        p_enterprise_id: enterpriseId,
      });
      if (linkErr) throw new Error(`Jerarquía cuentas: ${linkErr.message}`);
      stepsCompleted.add("accounts");
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          result,
          errors,
          steps_completed: Array.from(stepsCompleted),
        })
        .eq("id", jobId);
    }

    const { data: accRows } = await sb
      .from("tab_accounts")
      .select("id, account_code")
      .eq("enterprise_id", enterpriseId);
    const accountIdByCode = new Map<string, number>();
    accRows?.forEach((r: any) => accountIdByCode.set(r.account_code, r.id));
    const accountIdByLegacy = new Map<string, number>();
    ds.accounts.forEach((a) => {
      if (a.legacyId !== undefined && a.legacyId !== null) {
        const id = accountIdByCode.get(a.code);
        if (id) accountIdByLegacy.set(String(a.legacyId), id);
      }
    });

    // ---------- 2. Períodos ----------
    const years = extractYears(ds);
    const periodRows = years.map((y) => ({
      enterprise_id: enterpriseId,
      year: y,
      start_date: `${y}-01-01`,
      end_date: `${y}-12-31`,
      status: "abierto",
      is_default_period: false,
    }));
    if (!stepsCompleted.has("periods") && !stepsCompleted.has("skip_periods")) {
      await updateProgress("Creando períodos...", 0, years.length, true);
      if (periodRows.length > 0) {
        result.periodsCreated = await insertCriticalRows(
          sb,
          "tab_accounting_periods",
          periodRows,
          "Períodos",
          10,
        );
      }
      stepsCompleted.add("periods");
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          result,
          errors,
          steps_completed: Array.from(stepsCompleted),
        })
        .eq("id", jobId);
    }
    const { data: perRows } = await sb
      .from("tab_accounting_periods")
      .select("id, year")
      .eq("enterprise_id", enterpriseId);
    const periodIdByYear = new Map<number, number>();
    perRows?.forEach((r: any) => periodIdByYear.set(r.year, r.id));

    // ---------- 3. Compras ----------
    const { data: opTypes } = await sb
      .from("tab_operation_types")
      .select("id, code")
      .or(`enterprise_id.is.null,enterprise_id.eq.${enterpriseId}`);
    const opTypeIdByCode = new Map<string, number>();
    opTypes?.forEach((o: any) => opTypeIdByCode.set(o.code, o.id));

    const bookKeys = new Set<string>();
    ds.purchases.forEach((p) => {
      if (!p.date) return;
      const [y, m] = p.date.split("-").map(Number);
      bookKeys.add(`${y}-${m}`);
    });
    const bookIdByYM = new Map<string, number>();

    const startTs = Date.now();
    const shouldYield = () => Date.now() - startTs > MAX_RUNTIME_MS;

    // Helper: inserta en lotes con fallback fila-por-fila y soporte de reanudación
    async function insertBatched<T>(
      table: string,
      rows: T[],
      label: string,
      stepKey: string,
      stepLabel: string,
      counterKey: keyof ImportResult,
    ): Promise<"done" | "yield"> {
      if (stepsCompleted.has(stepKey)) return "done";
      // Reanudación: si el job ya tiene current_step igual al nuestro, reusar current_count
      let startIdx = 0;
      if (
        job.current_step === stepLabel &&
        typeof job.current_count === "number"
      ) {
        startIdx = Math.min(job.current_count, rows.length);
      }
      // Si ya teníamos result.<counter>, usar ese como punto de partida también
      const alreadyCount = (result as any)[counterKey] as number;
      if (alreadyCount > startIdx)
        startIdx = Math.min(alreadyCount, rows.length);

      await updateProgress(stepLabel, startIdx, rows.length, true);

      for (let i = startIdx; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK);
        const { error } = await sb.from(table).insert(part as any);
        if (error) {
          // Fallback fila-por-fila: aísla el problema y deja un error explicativo
          let okCount = 0;
          let firstErr: string | null = null;
          for (const row of part) {
            const { error: rErr } = await sb.from(table).insert(row as any);
            if (rErr) {
              if (!firstErr) firstErr = rErr.message;
              errors.push(`${label}: ${rErr.message}`);
            } else {
              okCount++;
            }
          }
          (result as any)[counterKey] =
            ((result as any)[counterKey] as number) + okCount;
          if (firstErr) {
            console.warn(
              `${label} batch falló, ${okCount}/${part.length} ok. Primer error: ${firstErr}`,
            );
          }
        } else {
          (result as any)[counterKey] =
            ((result as any)[counterKey] as number) + part.length;
        }
        await sb
          .from("tab_legacy_import_jobs")
          .update({
            result,
            errors,
            current_step: stepLabel,
            current_count: i + part.length,
            total_count: rows.length,
          })
          .eq("id", jobId);

        if (shouldYield()) {
          return "yield";
        }
      }

      stepsCompleted.add(stepKey);
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          result,
          errors,
          steps_completed: Array.from(stepsCompleted),
        })
        .eq("id", jobId);
      return "done";
    }

    if (
      !stepsCompleted.has("purchase_books") &&
      !stepsCompleted.has("skip_purchases")
    ) {
      for (const key of bookKeys) {
        const [y, m] = key.split("-").map(Number);
        if (
          !Number.isFinite(y) ||
          !Number.isFinite(m) ||
          y < 1900 ||
          y > 2100 ||
          m < 1 ||
          m > 12
        ) {
          errors.push(`Libro de compras omitido por fecha inválida: ${key}`);
          continue;
        }
        const { data: bk } = await sb
          .from("tab_purchase_books")
          .insert({
            enterprise_id: enterpriseId,
            year: y,
            month: m,
            created_by: userId,
          })
          .select("id")
          .single();
        if (bk) bookIdByYM.set(key, bk.id);
      }
      stepsCompleted.add("purchase_books");
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          steps_completed: Array.from(stepsCompleted),
        })
        .eq("id", jobId);
    } else if (!stepsCompleted.has("skip_purchases")) {
      const { data: existingBooks } = await sb
        .from("tab_purchase_books")
        .select("id, year, month")
        .eq("enterprise_id", enterpriseId);
      existingBooks?.forEach((bk: any) =>
        bookIdByYM.set(`${bk.year}-${bk.month}`, bk.id),
      );
    }

    const purchaseRows = ds.purchases.map((p) => {
      const [y, m] = p.date.split("-").map(Number);
      const expenseAccountId = p.legacyAccountId
        ? (accountIdByLegacy.get(String(p.legacyAccountId)) ?? null)
        : null;
      return {
        enterprise_id: enterpriseId,
        accounting_period_id: periodIdByYear.get(y) ?? null,
        purchase_book_id: bookIdByYM.get(`${y}-${m}`) ?? null,
        invoice_date: p.date,
        invoice_series: p.series || "",
        invoice_number: p.number || "0",
        fel_document_type: p.felDocType,
        supplier_nit: p.supplierNit,
        supplier_name: p.supplierName,
        net_amount: p.netAmount,
        base_amount: p.netAmount,
        vat_amount: p.vatAmount,
        total_amount: p.totalAmount,
        original_total: p.totalAmount,
        original_subtotal: p.netAmount,
        original_vat: p.vatAmount,
        currency_code: "GTQ",
        exchange_rate: 1,
        imported_from_fel: false,
        exempt_amount: (Number((p as any).exemptAmount) || 0) + (Number((p as any).idpAmount) || 0),
        tax_category: (p as any).taxCategory ?? (Number((p as any).idpAmount) > 0 ? "IDP" : null),
        operation_type_id: opTypeIdByCode.get(p.operationTypeCode) ?? null,
        expense_account_id: expenseAccountId,
      };
    });

    if (!stepsCompleted.has("skip_purchases")) {
      const purchasesOutcome = await insertBatched(
        "tab_purchase_ledger",
        purchaseRows,
        "Compras",
        "purchases",
        "Importando compras...",
        "purchasesCreated",
      );
      if (purchasesOutcome === "yield") {
        await queueContinuation(jobId);
        return;
      }
    }

    // ---------- 4. Ventas ----------
    const salesRows = ds.sales.map((s) => {
      const [y] = s.date.split("-").map(Number);
      const incomeAccountId = s.legacyAccountId
        ? (accountIdByLegacy.get(String(s.legacyAccountId)) ?? null)
        : null;
      return {
        enterprise_id: enterpriseId,
        accounting_period_id: periodIdByYear.get(y) ?? null,
        invoice_date: s.date,
        invoice_series: s.series || "",
        invoice_number: s.number || "0",
        authorization_number: s.authorizationNumber || "IMPORTADO",
        fel_document_type: s.felDocType,
        customer_nit: s.customerNit,
        customer_name: s.customerName,
        net_amount: s.netAmount,
        vat_amount: s.vatAmount,
        total_amount: s.totalAmount,
        original_total: s.totalAmount,
        original_subtotal: s.netAmount,
        original_vat: s.vatAmount,
        currency_code: "GTQ",
        exchange_rate: 1,
        imported_from_fel: false,
        is_annulled: false,
        operation_type_id: s.operationTypeCode
          ? (opTypeIdByCode.get(s.operationTypeCode) ?? null)
          : null,
        income_account_id: incomeAccountId,
        establishment_code: s.branchCode ?? null,
        establishment_name: s.branchCode ? `Sucursal ${s.branchCode}` : null,
      };
    });

    if (!stepsCompleted.has("skip_sales")) {
      const salesOutcome = await insertBatched(
        "tab_sales_ledger",
        salesRows,
        "Ventas",
        "sales",
        "Importando ventas...",
        "salesCreated",
      );
      if (salesOutcome === "yield") {
        await queueContinuation(jobId);
        return;
      }
    }

    // ---------- 5. Partidas (BATCH) ----------
    if (!stepsCompleted.has("skip_journalEntries")) {
      await updateProgress(
        "Importando partidas...",
        0,
        ds.journalEntries.length,
        true,
      );
      const sortedEntries = [...ds.journalEntries].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      const counterByYM = new Map<string, number>();

      // Pre-resolver cuentas y armar headers + detalles en memoria
      type PreparedEntry = {
        header: any;
        details: any[];
        balanced: boolean;
        shouldPost: boolean;
      };
      const prepared: PreparedEntry[] = [];

      for (const entry of sortedEntries) {
        const [y, m] = entry.date.split("-").map(Number);
        const periodId = periodIdByYear.get(y);
        if (!periodId) continue;
        const lines = entry.lines
          .map((l: any) => ({
            ...l,
            accountId: accountIdByCode.get(l.accountCode),
          }))
          .filter((l: any) => l.accountId && (l.debit > 0 || l.credit > 0));
        if (lines.length === 0) continue;

        const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
        const totalCredit = lines.reduce(
          (s: number, l: any) => s + l.credit,
          0,
        );
        const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
        // Si el archivo trae explícitamente Mayorizada=false → respetar borrador
        // Si Mayorizada=true (o no viene) → contabilizar siempre que esté cuadrada
        const shouldPost = balanced && entry.isPostedFlag !== false;
        const ymKey = `${y}-${String(m).padStart(2, "0")}`;
        const next = (counterByYM.get(ymKey) ?? 0) + 1;
        counterByYM.set(ymKey, next);
        const entryNumber = `${ymKey}-${String(next).padStart(5, "0")}`;
        const generalDescription = entry.description || "Importación legado";

        // Detectar tipo de partida desde la descripción
        const upperDesc = generalDescription.toUpperCase();
        let detectedType: "diario" | "apertura" | "cierre" = "diario";
        // Tolerante a typos comunes (p.ej. "PAERTURA"): se reconocen variantes equivalentes.
        if (/\b(?:RE)?(?:APERTURA|PAERTURA|APRETURA)\b/.test(upperDesc)) detectedType = "apertura";
        else if (/\bCIERRE\b/.test(upperDesc)) detectedType = "cierre";
        // Traslado de resultado al patrimonio: también es operación de cierre, no operativa
        else if (/RESULTADO DEL PERIODO|RESULTADO DEL PERÍODO|TRASLADO DE RESULTADO|RESULTADO DEL EJERCICIO|RESULTADO DEL EJERICIO/.test(upperDesc)) detectedType = "cierre";

        prepared.push({
          header: {
            enterprise_id: enterpriseId,
            accounting_period_id: periodId,
            entry_number: entryNumber,
            entry_date: entry.date,
            description: generalDescription,
            entry_type: detectedType,
            document_reference: entry.reference || null,
            currency_code: "GTQ",
            exchange_rate: 1,
            total_debit: totalDebit,
            total_credit: totalCredit,
            is_posted: false,
            status: "borrador",
            created_by: userId,
          },
          details: lines.map((l: any, idx: number) => ({
            line_number: idx + 1,
            account_id: l.accountId!,
            debit_amount: l.debit,
            credit_amount: l.credit,
            description: generalDescription,
            currency_code: "GTQ",
            exchange_rate: 1,
            original_debit: l.debit,
            original_credit: l.credit,
          })),
          balanced,
          shouldPost,
        });
      }

      let processed = stepsCompleted.has("journal_entries")
        ? prepared.length
        : Math.min(
            result.journalEntriesCreated + result.journalEntriesAsDraft,
            prepared.length,
          );
      const sliceStart = processed;
      const journalSlice = prepared.slice(
        sliceStart,
        sliceStart + JOURNAL_SLICE,
      );
      await updateProgress(
        "Importando partidas...",
        processed,
        prepared.length,
        true,
      );

      for (const entryBatch of journalSlice) {
        const { data: insertedHeader, error: hErr } = await sb
          .from("tab_journal_entries")
          .insert(entryBatch.header)
          .select("id")
          .single();

        if (hErr || !insertedHeader) {
          errors.push(
            `Partida ${entryBatch.header.entry_number}: ${hErr?.message ?? "sin respuesta"}`,
          );
          processed += 1;
          await updateProgress(
            "Importando partidas...",
            processed,
            prepared.length,
          );
          continue;
        }

        const detailRows = entryBatch.details.map((detail) => ({
          ...detail,
          journal_entry_id: insertedHeader.id,
        }));

        let detailFailed = false;
        for (const detPart of chunk(detailRows, DETAIL_CHUNK)) {
          const { error: dErr } = await sb
            .from("tab_journal_entry_details")
            .insert(detPart);
          if (dErr) {
            let rowFails = 0;
            for (const row of detPart) {
              const { error: rErr } = await sb
                .from("tab_journal_entry_details")
                .insert(row);
              if (rErr) rowFails++;
            }
            if (rowFails > 0) {
              detailFailed = true;
              errors.push(
                `Detalles ${entryBatch.header.entry_number}: ${rowFails} líneas omitidas (${dErr.message})`,
              );
            }
          }
        }

        result.journalEntriesCreated++;

        if (!detailFailed && entryBatch.shouldPost) {
          const { error: pErr } = await sb
            .from("tab_journal_entries")
            .update({
              is_posted: true,
              status: "contabilizado",
              posted_at: new Date().toISOString(),
            })
            .eq("id", insertedHeader.id);

          if (pErr) {
            errors.push(
              `Posting ${entryBatch.header.entry_number}: ${pErr.message}`,
            );
            result.journalEntriesAsDraft++;
          } else {
            result.journalEntriesPosted++;
          }
        } else {
          result.journalEntriesAsDraft++;
        }

        processed += 1;
        await updateProgress(
          "Importando partidas...",
          processed,
          prepared.length,
        );
      }

      await sb
        .from("tab_legacy_import_jobs")
        .update({
          result,
          errors,
          current_step: "Importando partidas...",
          current_count: processed,
          total_count: prepared.length,
        })
        .eq("id", jobId);

      if (processed < prepared.length) {
        await queueContinuation(jobId);
        return;
      }

      stepsCompleted.add("journal_entries");
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          result,
          errors,
          steps_completed: Array.from(stepsCompleted),
        })
        .eq("id", jobId);
    }

    // ---------- 6. Categorías de Activos Fijos ----------
    const categoryIdByLegacy = new Map<string, number>();
    if (
      !stepsCompleted.has("asset_categories") &&
      !stepsCompleted.has("skip_assetCategories") &&
      ds.assetCategories.length > 0
    ) {
      await updateProgress(
        "Creando categorías de activos...",
        0,
        ds.assetCategories.length,
        true,
      );
      for (const cat of ds.assetCategories) {
        const assetAccountId = cat.legacyAccountId
          ? accountIdByLegacy.get(String(cat.legacyAccountId))
          : null;
        const { data: c, error } = await sb
          .from("fixed_asset_categories")
          .insert({
            enterprise_id: enterpriseId,
            code: cat.code || `LEG-${cat.legacyId}`,
            name: cat.name,
            asset_account_id: assetAccountId ?? null,
            default_useful_life_months: 60,
            default_residual_value: 0,
            is_active: true,
          })
          .select("id")
          .single();
        if (error)
          errors.push(`Categoría activo ${cat.name}: ${error.message}`);
        else if (c) {
          categoryIdByLegacy.set(String(cat.legacyId), c.id);
          result.assetCategoriesCreated++;
        }
      }
      stepsCompleted.add("asset_categories");
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          result,
          errors,
          steps_completed: Array.from(stepsCompleted),
        })
        .eq("id", jobId);
    }

    const { data: existingCategories } = await sb
      .from("fixed_asset_categories")
      .select("id, code")
      .eq("enterprise_id", enterpriseId);
    existingCategories?.forEach((row: any) =>
      categoryIdByLegacy.set(String(row.code), row.id),
    );
    ds.assetCategories.forEach((cat) => {
      const byCode = existingCategories?.find(
        (row: any) => row.code === (cat.code || `LEG-${cat.legacyId}`),
      );
      if (byCode) categoryIdByLegacy.set(String(cat.legacyId), byCode.id);
    });

    // ---------- 7. Activos Fijos ----------
    if (
      !stepsCompleted.has("fixed_assets") &&
      !stepsCompleted.has("skip_fixedAssets") &&
      ds.fixedAssets.length > 0
    ) {
      await updateProgress(
        "Importando activos fijos...",
        0,
        ds.fixedAssets.length,
        true,
      );
      const { data: ent } = await sb
        .from("tab_enterprises")
        .select("tenant_id")
        .eq("id", enterpriseId)
        .single();
      const tenantId = (ent as any)?.tenant_id;

      let fallbackCategoryId: number | null =
        categoryIdByLegacy.size > 0
          ? Array.from(categoryIdByLegacy.values())[0]
          : null;
      if (!fallbackCategoryId) {
        const { data: c } = await sb
          .from("fixed_asset_categories")
          .insert({
            enterprise_id: enterpriseId,
            code: "GEN",
            name: "General (importado)",
            default_useful_life_months: 60,
            default_residual_value: 0,
            is_active: true,
          })
          .select("id")
          .single();
        if (c) {
          fallbackCategoryId = c.id;
          result.assetCategoriesCreated++;
        }
      }

      let assetIdx = 0;
      const usedAssetCodes = new Set<string>();
      const assetRows: any[] = [];
      for (const a of ds.fixedAssets) {
        assetIdx++;
        const categoryId =
          (a.legacyCategoryId &&
            categoryIdByLegacy.get(String(a.legacyCategoryId))) ||
          fallbackCategoryId;
        if (!categoryId) {
          errors.push(`Activo ${a.name}: sin categoría`);
          continue;
        }
        const baseAssetCode =
          String(a.code || `LEG-${assetIdx}`).trim() || `LEG-${assetIdx}`;
        let assetCode = baseAssetCode;
        let suffix = 1;
        while (usedAssetCodes.has(assetCode)) {
          suffix += 1;
          assetCode = `${baseAssetCode}-${suffix}`;
        }
        usedAssetCodes.add(assetCode);

        assetRows.push({
          enterprise_id: enterpriseId,
          tenant_id: tenantId,
          asset_code: assetCode,
          asset_name: a.name,
          category_id: categoryId,
          acquisition_date: a.acquisitionDate,
          in_service_date: a.inServiceDate ?? a.acquisitionDate,
          acquisition_cost: a.cost,
          residual_value: a.residualValue,
          useful_life_months: a.usefulLifeMonths,
          currency: "GTQ",
          status: a.status,
          notes:
            [
              a.serial && `Serie: ${a.serial}`,
              a.model && `Modelo: ${a.model}`,
              a.characteristics,
            ]
              .filter(Boolean)
              .join(" | ") || null,
          created_by: userId,
          original_acquisition_cost: a.cost,
          original_residual_value: a.residualValue,
          exchange_rate_at_acquisition: 1,
        });
      }
      for (const part of chunk(assetRows, 100)) {
        const { error } = await sb.from("fixed_assets").insert(part);
        if (error) {
          let inserted = 0;
          let firstErr: string | null = null;
          for (const row of part) {
            const { error: rowErr } = await sb.from("fixed_assets").insert(row);
            if (rowErr) {
              firstErr ??= rowErr.message;
              errors.push(`Activos ${row.asset_code}: ${rowErr.message}`);
            } else {
              inserted += 1;
            }
          }
          result.fixedAssetsCreated += inserted;
          if (firstErr)
            console.warn(
              `Activos batch falló, ${inserted}/${part.length} insertados. Primer error: ${firstErr}`,
            );
        } else result.fixedAssetsCreated += part.length;
        await updateProgress(
          "Importando activos fijos...",
          result.fixedAssetsCreated,
          assetRows.length,
        );
      }
      stepsCompleted.add("fixed_assets");
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          result,
          errors,
          steps_completed: Array.from(stepsCompleted),
        })
        .eq("id", jobId);
    }

    // ---------- 8. Cerrar períodos (excepto el último, que queda abierto) ----------
    if (!stepsCompleted.has("close_periods")) {
      await updateProgress("Cerrando períodos...", 0, 1, true);
      const sortedYears = [...years].sort((a, b) => a - b);
      const lastYear = sortedYears[sortedYears.length - 1];
      if (sortedYears.length > 1) {
        await sb
          .from("tab_accounting_periods")
          .update({
            status: "cerrado",
            closed_at: new Date().toISOString(),
            closed_by: userId,
          })
          .eq("enterprise_id", enterpriseId)
          .neq("year", lastYear);
      }
      if (lastYear) {
        await sb
          .from("tab_accounting_periods")
          .update({ status: "abierto", is_default_period: true })
          .eq("enterprise_id", enterpriseId)
          .eq("year", lastYear);
      }
      stepsCompleted.add("close_periods");
    }

    const finalStatus = errors.length > 0 ? "failed" : "completed";
    await sb
      .from("tab_legacy_import_jobs")
      .update({
        status: finalStatus,
        current_step: "Importación completa",
        current_count: 1,
        total_count: 1,
        finished_at: new Date().toISOString(),
        result,
        errors,
        error_message: errors.length > 0 ? errors[0] : null,
        steps_completed: Array.from(stepsCompleted),
      })
      .eq("id", jobId);
  } catch (e: any) {
    console.error("Error fatal", e);
    await sb
      .from("tab_legacy_import_jobs")
      .update({
        status: "failed",
        error_message: String(e?.message ?? e),
        errors,
        result,
        finished_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json();

    if (body?.action === "clear") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const requestedClearJobId =
        typeof body.clearJobId === "string" ? body.clearJobId : undefined;
      const isInternalClearContinuation =
        requestedClearJobId && authHeader === `Bearer ${SERVICE_ROLE}`;
      const enterpriseId = Number(body.enterpriseId);
      if (!enterpriseId) {
        return new Response(
          JSON.stringify({ error: "enterpriseId requerido" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false },
      });

      const client = isInternalClearContinuation
        ? adminClient
        : (await createAuthedClient(authHeader)).client;

      const { data: enterprise, error: enterpriseErr } = await client
        .from("tab_enterprises")
        .select("id, tenant_id")
        .eq("id", enterpriseId)
        .maybeSingle();

      if (enterpriseErr || !enterprise) {
        return new Response(
          JSON.stringify({ error: "No tienes acceso a esta empresa" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // Obtener el usuario para crear job de progreso
      const userId = isInternalClearContinuation
        ? undefined
        : (await client.auth.getUser()).data?.user?.id;

      let progressJobId = requestedClearJobId;
      if (!progressJobId) {
        const { data: progressJob, error: progJobErr } = await adminClient
          .from("tab_legacy_import_jobs")
          .insert({
            enterprise_id: enterpriseId,
            tenant_id: (enterprise as any).tenant_id,
            created_by: userId,
            status: "running",
            current_step: "Preparando borrado...",
            started_at: new Date().toISOString(),
            payload: { action: "clear" },
          })
          .select("id")
          .single();

        if (progJobErr || !progressJob?.id) {
          console.error("No se pudo crear job de progreso", progJobErr);
          return new Response(
            JSON.stringify({ error: "No se pudo iniciar el borrado" }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        progressJobId = progressJob.id as string;
      }

      EdgeRuntime.waitUntil(runClear(progressJobId, enterpriseId));

      return new Response(
        JSON.stringify({ ok: true, jobId: progressJobId, clearing: true }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { jobId } = body;
    if (!jobId || typeof jobId !== "string") {
      return new Response(JSON.stringify({ error: "jobId requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Require authentication for triggering imports
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Allow internal service-role continuations (function calling itself)
    const isInternalContinuation = authHeader === `Bearer ${SERVICE_ROLE}`;

    if (!isInternalContinuation) {
      // Verify JWT and that caller owns / has access to the job
      const { client: userClient, user } = await createAuthedClient(authHeader);
      if (!user?.id) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false },
      });

      const { data: jobRow, error: jobErr } = await adminClient
        .from("tab_legacy_import_jobs")
        .select("id, created_by, enterprise_id")
        .eq("id", jobId)
        .maybeSingle();

      if (jobErr || !jobRow) {
        return new Response(JSON.stringify({ error: "Job no encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let allowed = jobRow.created_by === user.id;
      if (!allowed) {
        const { data: link } = await adminClient
          .from("tab_user_enterprises")
          .select("user_id")
          .eq("user_id", user.id)
          .eq("enterprise_id", jobRow.enterprise_id)
          .maybeSingle();
        allowed = !!link;
      }

      if (!allowed) {
        return new Response(JSON.stringify({ error: "Sin acceso a este job" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    EdgeRuntime.waitUntil(runImport(jobId));
    return new Response(JSON.stringify({ ok: true, jobId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

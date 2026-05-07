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
  date: string; series: string; number: string; felDocType: string;
  supplierNit: string; supplierName: string;
  netAmount: number; vatAmount: number; totalAmount: number; idpAmount: number;
  operationTypeCode: string; authorizationNumber?: string;
  legacyAccountId?: string | number;
}
interface ParsedSale {
  date: string; series: string; number: string; felDocType: string;
  customerNit: string; customerName: string;
  netAmount: number; vatAmount: number; totalAmount: number;
  operationTypeCode?: string; legacyAccountId?: string | number;
  authorizationNumber?: string; branchCode?: string;
}
interface ParsedJournalLine {
  accountCode: string; debit: number; credit: number; description?: string;
}
interface ParsedJournalEntry {
  legacyId?: string | number; date: string; description: string;
  reference?: string; lines: ParsedJournalLine[];
}
interface ParsedAssetCategory {
  legacyId: string | number; code: string; name: string;
  legacyAccountId?: string | number;
}
interface ParsedFixedAsset {
  code: string; name: string; serial?: string; model?: string;
  characteristics?: string; acquisitionDate: string; inServiceDate?: string;
  cost: number; residualValue: number; usefulLifeMonths: number;
  legacyCategoryId?: string | number; status: "ACTIVE" | "DISPOSED";
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
            ["import", "clear_then_import", "skip"].includes((item as ImportPlanTableDecision).mode),
        )
      : [],
  };
}

function getDecisionForTable(plan: Required<ImportPlan>, tableKey: string): ImportPlanTableDecision["mode"] {
  return plan.decisions.find((item) => item.tableKey === tableKey)?.mode
    ?? (plan.clearExisting ? "clear_then_import" : "import");
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function inferBalanceType(t: string): string {
  switch (t) {
    case "activo": case "gasto": case "costo": return "deudor";
    case "pasivo": case "capital": case "ingreso": return "acreedor";
    default: return "deudor";
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
    ...(existing && typeof existing === "object" ? (existing as Partial<ImportResult>) : {}),
  };
}

function parseCompletedSteps(existing: unknown): Set<string> {
  return new Set(Array.isArray(existing) ? existing.filter((step) => typeof step === "string") : []);
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

async function queueClearContinuation(clearJobId: string, enterpriseId: number) {
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

async function isJobStillActive(sb: ReturnType<typeof createClient>, jobId: string) {
  const { data } = await sb
    .from("tab_legacy_import_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  return !!data && (data.status === "pending" || data.status === "running");
}

async function runClear(clearJobId: string, enterpriseId: number) {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const clearStartTs = Date.now();
  const shouldYield = () => Date.now() - clearStartTs > CLEAR_MAX_RUNTIME_MS;

  const { data: clearJob, error: clearJobErr } = await sb
    .from("tab_legacy_import_jobs")
    .select("id, status, current_step, current_count, total_count, steps_completed, result, started_at")
    .eq("id", clearJobId)
    .single();

  if (clearJobErr || !clearJob) {
    console.error("Job de borrado no encontrado", clearJobErr);
    return;
  }

  const stepsCompleted = parseCompletedSteps((clearJob as any).steps_completed);
  const clearResult = {
    ...(clearJob.result && typeof clearJob.result === "object" ? clearJob.result : {}),
    deletedByStep:
      clearJob.result &&
      typeof clearJob.result === "object" &&
      (clearJob.result as Record<string, unknown>).deletedByStep &&
      typeof (clearJob.result as Record<string, unknown>).deletedByStep === "object"
        ? { ...((clearJob.result as Record<string, any>).deletedByStep ?? {}) }
        : {},
  } as { cleared?: boolean; deletedByStep: Record<string, number> };

  const persistClearJob = async (patch: Record<string, unknown> = {}) => {
    await sb.from("tab_legacy_import_jobs").update({
      status: "running",
      started_at: clearJob.started_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: clearResult,
      steps_completed: Array.from(stepsCompleted),
      ...patch,
    }).eq("id", clearJobId);
  };

  const updateDeletionSummary = (stepKey: string, deleted: number) => {
    clearResult.deletedByStep[stepKey] = deleted;
    clearResult.deletedTotal = Object.values(clearResult.deletedByStep).reduce((sum, value) => sum + Number(value || 0), 0);
  };

  const verifyTableEmpty = async (table: string, stepKey: string) => {
    const remaining = await countTable(table);
    clearResult.verifiedEmptyByStep = clearResult.verifiedEmptyByStep ?? {};
    clearResult.tableStats = clearResult.tableStats ?? {};
    clearResult.verifiedEmptyByStep[stepKey] = remaining === 0;
    clearResult.tableStats[stepKey] = remaining;
    return remaining;
  };

  const countTable = async (table: string) => {
    const { count } = await sb
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("enterprise_id", enterpriseId);
    return count ?? 0;
  };

  const deleteByIdsAdaptive = async (
    table: string,
    ids: Array<string | number>,
    label: string,
  ): Promise<number> => {
    if (!ids.length) return 0;

    const { error } = await sb.from(table).delete().in("id", ids as any);
    if (!error) return ids.length;

    if (isStatementTimeout(error.message) && ids.length > 1) {
      const mid = Math.floor(ids.length / 2);
      const left = await deleteByIdsAdaptive(table, ids.slice(0, mid), label);
      const right = await deleteByIdsAdaptive(table, ids.slice(mid), label);
      return left + right;
    }

    if (ids.length > 1) {
      let deleted = 0;
      let firstError: string | null = null;
      for (const id of ids) {
        const { error: rowError } = await sb.from(table).delete().eq("id", id as any);
        if (rowError) {
          firstError ??= rowError.message;
        } else {
          deleted += 1;
        }
      }
      if (firstError) {
        throw new Error(`${label}: ${firstError}`);
      }
      return deleted;
    }

    throw new Error(`${label}: ${error.message}`);
  };

  const deleteByColumnAdaptive = async (
    table: string,
    column: string,
    values: Array<string | number>,
    label: string,
  ): Promise<void> => {
    if (!values.length) return;

    const { error } = await sb.from(table).delete().in(column, values as any);
    if (!error) return;

    if (isStatementTimeout(error.message) && values.length > 1) {
      const mid = Math.floor(values.length / 2);
      await deleteByColumnAdaptive(table, column, values.slice(0, mid), label);
      await deleteByColumnAdaptive(table, column, values.slice(mid), label);
      return;
    }

    const { data: dependentRows, error: selectErr } = await sb
      .from(table)
      .select("id")
      .in(column, values as any)
      .limit(CLEAR_DELETE_BATCH);

    if (selectErr) throw new Error(`${label}: ${selectErr.message}`);

    const dependentIds = (dependentRows ?? []).map((row: any) => row.id);
    if (!dependentIds.length) return;

    await deleteByIdsAdaptive(table, dependentIds, label);
  };

  const deletePurchaseBooksAdaptive = async (): Promise<boolean> => {
    if (stepsCompleted.has("purchase_books_clear")) return false;

    let deletedBooks = clearResult.deletedByStep.purchase_books_clear ?? 0;
    const { count: remainingBooks } = await sb
      .from("tab_purchase_books")
      .select("id", { count: "exact", head: true })
      .eq("enterprise_id", enterpriseId);
    const totalBooks = Math.max(deletedBooks + (remainingBooks ?? 0), deletedBooks);
    await persistClearJob({ current_step: "Borrando libros de compras...", current_count: deletedBooks, total_count: totalBooks });

    while (true) {
      const { data: bookRows, error: bookErr } = await sb
        .from("tab_purchase_books")
        .select("id")
        .eq("enterprise_id", enterpriseId)
        .order("id", { ascending: true })
        .limit(CLEAR_DELETE_BATCH);
      if (bookErr) throw new Error(`libros de compras: ${bookErr.message}`);
      if (!bookRows?.length) break;

      for (const book of bookRows) {
        await deleteByColumnAdaptive("tab_purchase_ledger", "purchase_book_id", [book.id], "compras por libro");
        const { error: deleteBookErr } = await sb.from("tab_purchase_books").delete().eq("id", book.id);
        if (deleteBookErr) {
          console.error("purchase_books_clear failed", {
            enterpriseId,
            clearJobId,
            purchaseBookId: book.id,
            deletedBooks,
            totalBooks,
            error: deleteBookErr.message,
          });
          throw new Error(`libros de compras [book:${book.id}]: ${deleteBookErr.message}`);
        }
        deletedBooks += 1;
        updateDeletionSummary("purchase_books_clear", deletedBooks);
        await persistClearJob({ current_step: "Borrando libros de compras...", current_count: deletedBooks, total_count: totalBooks });

        if (shouldYield()) {
          await queueClearContinuation(clearJobId, enterpriseId);
          return true;
        }
      }
    }

    const remaining = await verifyTableEmpty("tab_purchase_books", "purchase_books_clear");
    if (remaining > 0) throw new Error(`libros de compras: quedaron ${remaining} registros sin borrar`);
    stepsCompleted.add("purchase_books_clear");
    await persistClearJob({ current_step: "Borrando libros de compras...", current_count: deletedBooks, total_count: totalBooks });
    return false;
  };

  const deleteSimpleEnterpriseTable = async (
    table: string,
    label: string,
    stepKey: string,
    batchSize = CLEAR_DELETE_BATCH,
  ): Promise<boolean> => {
    if (stepsCompleted.has(stepKey)) return false;

    let deleted = clearResult.deletedByStep[stepKey] ?? 0;
    const remaining = await countTable(table);
    const total = Math.max(deleted + remaining, deleted);
    await persistClearJob({ current_step: `Borrando ${label}...`, current_count: deleted, total_count: total });

    while (true) {
      const { data, error } = await sb
        .from(table)
        .select("id")
        .eq("enterprise_id", enterpriseId)
        .order("id", { ascending: true })
        .limit(batchSize);
      if (error) throw new Error(`${label}: ${error.message}`);
      if (!data?.length) break;

      deleted += await deleteByIdsAdaptive(table, data.map((row: any) => row.id), label);
      updateDeletionSummary(stepKey, deleted);
      await persistClearJob({ current_step: `Borrando ${label}...`, current_count: deleted, total_count: total });

      if (shouldYield()) {
        await queueClearContinuation(clearJobId, enterpriseId);
        return true;
      }
    }

    const remaining = await verifyTableEmpty(table, stepKey);
    if (remaining > 0) throw new Error(`${label}: quedaron ${remaining} registros sin borrar`);
    stepsCompleted.add(stepKey);
    await persistClearJob({ current_step: `Borrando ${label}...`, current_count: deleted, total_count: total });
    return false;
  };

  await persistClearJob();

  try {
    if (!stepsCompleted.has("cancel_active_jobs")) {
      await sb
        .from("tab_legacy_import_jobs")
        .update({
          status: "failed",
          error_message: "Proceso cancelado manualmente antes del borrado.",
          finished_at: new Date().toISOString(),
        })
        .eq("enterprise_id", enterpriseId)
        .in("status", ["pending", "running"])
        .neq("id", clearJobId);

      stepsCompleted.add("cancel_active_jobs");
      await persistClearJob({ current_step: "Preparando borrado...", current_count: 0, total_count: 1 });
    }

    if (!stepsCompleted.has("journal_entries_clear")) {
      let deletedEntries = clearResult.deletedByStep.journal_entries_clear ?? 0;
      const remainingEntries = await countTable("tab_journal_entries");
      const totalEntries = Math.max(deletedEntries + remainingEntries, deletedEntries);
      await persistClearJob({ current_step: "Borrando partidas...", current_count: deletedEntries, total_count: totalEntries });

      while (true) {
        const { data: entryRows, error: entryErr } = await sb
          .from("tab_journal_entries")
          .select("id")
          .eq("enterprise_id", enterpriseId)
          .order("id", { ascending: true })
          .limit(CLEAR_DELETE_BATCH);
        if (entryErr) throw entryErr;
        if (!entryRows?.length) break;

        const entryIds = entryRows.map((row) => row.id);
        await deleteByColumnAdaptive("tab_journal_entry_details", "journal_entry_id", entryIds, "detalles de partidas");
        deletedEntries += await deleteByIdsAdaptive("tab_journal_entries", entryIds, "partidas");
        updateDeletionSummary("journal_entries_clear", deletedEntries);
        await persistClearJob({ current_step: "Borrando partidas...", current_count: deletedEntries, total_count: totalEntries });

        if (shouldYield()) {
          await queueClearContinuation(clearJobId, enterpriseId);
          return;
        }
      }

      const remainingEntriesAfter = await verifyTableEmpty("tab_journal_entries", "journal_entries_clear");
      if (remainingEntriesAfter > 0) throw new Error(`partidas: quedaron ${remainingEntriesAfter} registros sin borrar`);
      stepsCompleted.add("journal_entries_clear");
      await persistClearJob({ current_step: "Borrando partidas...", current_count: deletedEntries, total_count: totalEntries });
    }

    if (!stepsCompleted.has("fixed_assets_clear")) {
      let deletedAssets = clearResult.deletedByStep.fixed_assets_clear ?? 0;
      const remainingAssets = await countTable("fixed_assets");
      const totalAssets = Math.max(deletedAssets + remainingAssets, deletedAssets);
      await persistClearJob({ current_step: "Borrando activos fijos...", current_count: deletedAssets, total_count: totalAssets });

      while (true) {
        const { data: assetRows, error: assetErr } = await sb
          .from("fixed_assets")
          .select("id")
          .eq("enterprise_id", enterpriseId)
          .order("id", { ascending: true })
          .limit(CLEAR_DELETE_BATCH);
        if (assetErr) throw assetErr;
        if (!assetRows?.length) break;

        const assetIds = assetRows.map((row) => row.id);
        await deleteByColumnAdaptive("fixed_asset_depreciation_schedule", "asset_id", assetIds, "depreciaciones de activos");
        await deleteByColumnAdaptive("fixed_asset_event_log", "asset_id", assetIds, "bitácora de activos");
        deletedAssets += await deleteByIdsAdaptive("fixed_assets", assetIds, "activos fijos");
        updateDeletionSummary("fixed_assets_clear", deletedAssets);
        await persistClearJob({ current_step: "Borrando activos fijos...", current_count: deletedAssets, total_count: totalAssets });

        if (shouldYield()) {
          await queueClearContinuation(clearJobId, enterpriseId);
          return;
        }
      }

      const remainingAssetsAfter = await verifyTableEmpty("fixed_assets", "fixed_assets_clear");
      if (remainingAssetsAfter > 0) throw new Error(`activos fijos: quedaron ${remainingAssetsAfter} registros sin borrar`);
      stepsCompleted.add("fixed_assets_clear");
      await persistClearJob({ current_step: "Borrando activos fijos...", current_count: deletedAssets, total_count: totalAssets });
    }

    if (await deleteSimpleEnterpriseTable("tab_purchase_journal_links", "vínculos compra-partida", "purchase_journal_links_clear", 100)) return;
    if (await deleteSimpleEnterpriseTable("tab_purchase_ledger", "compras", "purchase_ledger_clear", 75)) return;
    if (await deleteSimpleEnterpriseTable("tab_sales_ledger", "ventas", "sales_ledger_clear", 50)) return;
    if (await deleteSimpleEnterpriseTable("fixed_asset_categories", "categorías de activos", "asset_categories_clear", 75)) return;
    if (await deletePurchaseBooksAdaptive()) return;
    if (await deleteSimpleEnterpriseTable("tab_period_inventory_closing", "cierres de inventario por período", "period_inventory_closing_clear", 75)) return;
    if (await deleteSimpleEnterpriseTable("tab_accounting_periods", "períodos", "periods_clear", 75)) return;

    if (!stepsCompleted.has("accounts_clear")) {
      let deletedAccounts = clearResult.deletedByStep.accounts_clear ?? 0;
      const remainingAccounts = await countTable("tab_accounts");
      const totalAccounts = Math.max(deletedAccounts + remainingAccounts, deletedAccounts);
      await persistClearJob({ current_step: "Borrando catálogo de cuentas...", current_count: deletedAccounts, total_count: totalAccounts });

      while (true) {
        const { data: accountRows, error: accountErr } = await sb
          .from("tab_accounts")
          .select("id, parent_account_id")
          .eq("enterprise_id", enterpriseId);
        if (accountErr) throw accountErr;
        if (!accountRows?.length) break;

        const parentIds = new Set(
          accountRows
            .map((row) => row.parent_account_id)
            .filter((id): id is number => typeof id === "number"),
        );
        const leafIds = accountRows
          .filter((row) => !parentIds.has(row.id))
          .slice(0, CLEAR_DELETE_BATCH)
          .map((row) => row.id);

        if (!leafIds.length) break;

        deletedAccounts += await deleteByIdsAdaptive("tab_accounts", leafIds, "catálogo de cuentas");
        updateDeletionSummary("accounts_clear", deletedAccounts);
        await persistClearJob({ current_step: "Borrando catálogo de cuentas...", current_count: deletedAccounts, total_count: totalAccounts });

        if (shouldYield()) {
          await queueClearContinuation(clearJobId, enterpriseId);
          return;
        }
      }

      const remainingAccountsAfter = await verifyTableEmpty("tab_accounts", "accounts_clear");
      if (remainingAccountsAfter > 0) throw new Error(`catálogo de cuentas: quedaron ${remainingAccountsAfter} registros sin borrar`);
      stepsCompleted.add("accounts_clear");
      await persistClearJob({ current_step: "Borrando catálogo de cuentas...", current_count: deletedAccounts, total_count: totalAccounts });
    }

    if (!stepsCompleted.has("payloads_clear")) {
      await persistClearJob({ current_step: "Limpiando archivos temporales...", current_count: 0, total_count: 1 });
      const { data: payloadRows, error: payloadErr } = await sb
        .from("tab_legacy_import_jobs")
        .select("payload_path")
        .eq("enterprise_id", enterpriseId)
        .not("payload_path", "is", null);
      if (payloadErr) throw payloadErr;

      const payloadPaths = (payloadRows ?? [])
        .map((row) => row.payload_path)
        .filter((path): path is string => !!path);

      if (payloadPaths.length > 0) {
        const { error: storageErr } = await sb.storage
          .from("legacy-imports")
          .remove(payloadPaths);
        if (storageErr) {
          console.warn("No se pudieron borrar algunos payloads", storageErr.message);
        }
      }

      stepsCompleted.add("payloads_clear");
      await persistClearJob({ current_step: "Limpiando archivos temporales...", current_count: 1, total_count: 1 });
    }

    if (!stepsCompleted.has("jobs_clear")) {
      await persistClearJob({ current_step: "Limpiando historial de importación...", current_count: 0, total_count: 1 });
      const { error: jobsErr } = await sb
        .from("tab_legacy_import_jobs")
        .delete()
        .eq("enterprise_id", enterpriseId)
        .neq("id", clearJobId);
      if (jobsErr) throw jobsErr;

      stepsCompleted.add("jobs_clear");
      await persistClearJob({ current_step: "Limpiando historial de importación...", current_count: 1, total_count: 1 });
    }

    clearResult.cleared = true;
    await sb.from("tab_legacy_import_jobs").update({
      status: "completed",
      current_step: "Borrado completado",
      current_count: clearResult.deletedTotal ?? 0,
      total_count: clearResult.deletedTotal ?? 0,
      updated_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      result: clearResult,
      steps_completed: Array.from(stepsCompleted),
    }).eq("id", clearJobId);
  } catch (clearErr: any) {
    console.error("clear failed", clearErr);
    await sb.from("tab_legacy_import_jobs").update({
      status: "failed",
      error_message: String(clearErr?.message ?? clearErr),
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: clearResult,
      steps_completed: Array.from(stepsCompleted),
    }).eq("id", clearJobId);
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
      await sb.from("tab_legacy_import_jobs").update({
        status: "failed",
        error_message: `No se pudo descargar el payload: ${dlErr?.message ?? "desconocido"}`,
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
      return;
    }
    ds = JSON.parse(await blob.text());
  } else {
    ds = job.payload;
  }

  const errors: string[] = Array.isArray(job.errors)
    ? job.errors.filter((item: unknown): item is string => typeof item === "string")
    : [];
  const result = mergeResult(job.result);
  const stepsCompleted = parseCompletedSteps(job.steps_completed);
  const importPlan = normalizeImportPlan((job as any).import_plan);
  result.importPlan = importPlan;

  const tableStats = await collectEnterpriseTableStats(sb, enterpriseId);
  result.tableStats = tableStats;

  if (!stepsCompleted.has("precheck")) {
    const blockingTables = ["accounts", "periods", "purchases", "sales", "journalEntries", "assetCategories", "fixedAssets"]
      .filter((key) => tableStats[key] > 0);

    for (const tableKey of blockingTables) {
      const mode = getDecisionForTable(importPlan, tableKey);
      if (mode === "skip") {
        stepsCompleted.add(`skip_${tableKey}`);
        continue;
      }
      if (mode === "import") {
        throw new Error(`${TABLE_LABELS[tableKey]}: ya existen ${tableStats[tableKey]} registros. Debes elegir borrar esa tabla o saltarla antes de importar.`);
      }
    }

    stepsCompleted.add("precheck");
    await sb.from("tab_legacy_import_jobs").update({
      result,
      errors,
      steps_completed: Array.from(stepsCompleted),
    }).eq("id", jobId);
  }

  let lastUpdate = 0;
  const updateProgress = async (
    step: string,
    current: number,
    total: number,
    force = false,
  ) => {
    const now = Date.now();
    if (!force && now - lastUpdate < 800) return; // throttle
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

  await sb
    .from("tab_legacy_import_jobs")
    .update({
      status: "running",
      started_at: job.started_at ?? new Date().toISOString(),
      errors,
      result,
      steps_completed: Array.from(stepsCompleted),
    })
    .eq("id", jobId);

  try {
    // ---------- 1. Cuentas ----------
    const levelByLen = (len: number) =>
      len === 6 ? 4 : len === 4 ? 3 : len === 2 ? 2 : 1;
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
    if (!stepsCompleted.has("accounts") && !stepsCompleted.has("skip_accounts")) {
      await updateProgress("Insertando cuentas...", 0, ds.accounts.length, true);
      for (const part of chunk(accountRows, CHUNK)) {
        const { error } = await sb.from("tab_accounts").insert(part);
        if (error) errors.push(`Cuentas: ${error.message}`);
        else result.accountsCreated += part.length;
        await updateProgress(
          "Insertando cuentas...",
          result.accountsCreated,
          accountRows.length,
        );
      }

      const { error: linkErr } = await sb.rpc("link_account_parents_by_code", {
        p_enterprise_id: enterpriseId,
      });
      if (linkErr) errors.push(`Jerarquía cuentas: ${linkErr.message}`);
      stepsCompleted.add("accounts");
      await sb.from("tab_legacy_import_jobs").update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      }).eq("id", jobId);
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
        const { error } = await sb
          .from("tab_accounting_periods")
          .insert(periodRows);
        if (error) errors.push(`Períodos: ${error.message}`);
        else result.periodsCreated += periodRows.length;
      }
      stepsCompleted.add("periods");
      await sb.from("tab_legacy_import_jobs").update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      }).eq("id", jobId);
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
      if (job.current_step === stepLabel && typeof job.current_count === "number") {
        startIdx = Math.min(job.current_count, rows.length);
      }
      // Si ya teníamos result.<counter>, usar ese como punto de partida también
      const alreadyCount = (result as any)[counterKey] as number;
      if (alreadyCount > startIdx) startIdx = Math.min(alreadyCount, rows.length);

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
          (result as any)[counterKey] = ((result as any)[counterKey] as number) + okCount;
          if (firstErr) {
            console.warn(`${label} batch falló, ${okCount}/${part.length} ok. Primer error: ${firstErr}`);
          }
        } else {
          (result as any)[counterKey] = ((result as any)[counterKey] as number) + part.length;
        }
        await sb.from("tab_legacy_import_jobs").update({
          result,
          errors,
          current_step: stepLabel,
          current_count: i + part.length,
          total_count: rows.length,
        }).eq("id", jobId);

        if (shouldYield()) {
          return "yield";
        }
      }

      stepsCompleted.add(stepKey);
      await sb.from("tab_legacy_import_jobs").update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      }).eq("id", jobId);
      return "done";
    }

    if (!stepsCompleted.has("purchase_books")) {
      for (const key of bookKeys) {
        const [y, m] = key.split("-").map(Number);
        if (!Number.isFinite(y) || !Number.isFinite(m) || y < 1900 || y > 2100 || m < 1 || m > 12) {
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
      await sb.from("tab_legacy_import_jobs").update({
        steps_completed: Array.from(stepsCompleted),
      }).eq("id", jobId);
    } else {
      const { data: existingBooks } = await sb
        .from("tab_purchase_books")
        .select("id, year, month")
        .eq("enterprise_id", enterpriseId);
      existingBooks?.forEach((bk: any) => bookIdByYM.set(`${bk.year}-${bk.month}`, bk.id));
    }

    const purchaseRows = ds.purchases.map((p) => {
      const [y, m] = p.date.split("-").map(Number);
      const expenseAccountId = p.legacyAccountId
        ? accountIdByLegacy.get(String(p.legacyAccountId)) ?? null
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
        idp_amount: p.idpAmount,
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
        ? accountIdByLegacy.get(String(s.legacyAccountId)) ?? null
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
          ? opTypeIdByCode.get(s.operationTypeCode) ?? null
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
      a.date.localeCompare(b.date)
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
      const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
      const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
      // Si el archivo trae explícitamente Mayorizada=false → respetar borrador
      // Si Mayorizada=true (o no viene) → contabilizar siempre que esté cuadrada
      const shouldPost = balanced && (entry.isPostedFlag !== false);
      const ymKey = `${y}-${String(m).padStart(2, "0")}`;
      const next = (counterByYM.get(ymKey) ?? 0) + 1;
      counterByYM.set(ymKey, next);
      const entryNumber = `${ymKey}-${String(next).padStart(5, "0")}`;
      const generalDescription = entry.description || "Importación legado";

      prepared.push({
        header: {
          enterprise_id: enterpriseId,
          accounting_period_id: periodId,
          entry_number: entryNumber,
          entry_date: entry.date,
          description: generalDescription,
          entry_type: "diario",
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
      : Math.min(result.journalEntriesCreated + result.journalEntriesAsDraft, prepared.length);
    const sliceStart = processed;
    const journalSlice = prepared.slice(sliceStart, sliceStart + JOURNAL_SLICE);
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
            errors.push(`Posting ${entryBatch.header.entry_number}: ${pErr.message}`);
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

    await sb.from("tab_legacy_import_jobs").update({
      result,
      errors,
      current_step: "Importando partidas...",
      current_count: processed,
      total_count: prepared.length,
    }).eq("id", jobId);

    if (processed < prepared.length) {
      await queueContinuation(jobId);
      return;
    }

      stepsCompleted.add("journal_entries");
      await sb.from("tab_legacy_import_jobs").update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      }).eq("id", jobId);
    }

    // ---------- 6. Categorías de Activos Fijos ----------
    const categoryIdByLegacy = new Map<string, number>();
    if (!stepsCompleted.has("asset_categories") && !stepsCompleted.has("skip_assetCategories") && ds.assetCategories.length > 0) {
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
        if (error) errors.push(`Categoría activo ${cat.name}: ${error.message}`);
        else if (c) {
          categoryIdByLegacy.set(String(cat.legacyId), c.id);
          result.assetCategoriesCreated++;
        }
      }
      stepsCompleted.add("asset_categories");
      await sb.from("tab_legacy_import_jobs").update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      }).eq("id", jobId);
    }

    const { data: existingCategories } = await sb
      .from("fixed_asset_categories")
      .select("id, code")
      .eq("enterprise_id", enterpriseId);
    existingCategories?.forEach((row: any) => categoryIdByLegacy.set(String(row.code), row.id));
    ds.assetCategories.forEach((cat) => {
      const byCode = existingCategories?.find((row: any) => row.code === (cat.code || `LEG-${cat.legacyId}`));
      if (byCode) categoryIdByLegacy.set(String(cat.legacyId), byCode.id);
    });

    // ---------- 7. Activos Fijos ----------
    if (!stepsCompleted.has("fixed_assets") && !stepsCompleted.has("skip_fixedAssets") && ds.fixedAssets.length > 0) {
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
        const baseAssetCode = String(a.code || `LEG-${assetIdx}`).trim() || `LEG-${assetIdx}`;
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
          if (firstErr) console.warn(`Activos batch falló, ${inserted}/${part.length} insertados. Primer error: ${firstErr}`);
        } else result.fixedAssetsCreated += part.length;
        await updateProgress(
          "Importando activos fijos...",
          result.fixedAssetsCreated,
          assetRows.length,
        );
      }
      stepsCompleted.add("fixed_assets");
      await sb.from("tab_legacy_import_jobs").update({
        result,
        errors,
        steps_completed: Array.from(stepsCompleted),
      }).eq("id", jobId);
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

      const requestedClearJobId = typeof body.clearJobId === "string" ? body.clearJobId : undefined;
      const isInternalClearContinuation = requestedClearJobId && authHeader === `Bearer ${SERVICE_ROLE}`;
      const enterpriseId = Number(body.enterpriseId);
      if (!enterpriseId) {
        return new Response(JSON.stringify({ error: "enterpriseId requerido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
        return new Response(JSON.stringify({ error: "No tienes acceso a esta empresa" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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
          return new Response(JSON.stringify({ error: "No se pudo iniciar el borrado" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        progressJobId = progressJob.id as string;
      }

      EdgeRuntime.waitUntil(runClear(progressJobId, enterpriseId));

      return new Response(JSON.stringify({ ok: true, jobId: progressJobId, clearing: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { jobId } = body;
    if (!jobId || typeof jobId !== "string") {
      return new Response(JSON.stringify({ error: "jobId requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

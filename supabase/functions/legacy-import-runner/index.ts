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
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const CHUNK = 500;
const ENTRY_BATCH = 100; // partidas por lote

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

  const errors: string[] = [];
  const result = {
    accountsCreated: 0,
    periodsCreated: 0,
    purchasesCreated: 0,
    salesCreated: 0,
    journalEntriesCreated: 0,
    journalEntriesPosted: 0,
    journalEntriesAsDraft: 0,
    assetCategoriesCreated: 0,
    fixedAssetsCreated: 0,
  };

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
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    // ---------- 1. Cuentas ----------
    await updateProgress("Insertando cuentas...", 0, ds.accounts.length, true);
    const accountRows = ds.accounts.map((a) => ({
      enterprise_id: enterpriseId,
      account_code: a.code,
      account_name: a.name,
      account_type: a.type,
      level: Math.max(1, Math.ceil(a.code.length / 2)),
      allows_movement: a.allowsMovement,
      requires_cost_center: false,
      is_active: true,
      balance_type: inferBalanceType(a.type),
      is_bank_account: false,
      is_monetary: false,
    }));
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
    await updateProgress("Creando períodos...", 0, years.length, true);
    const periodRows = years.map((y) => ({
      enterprise_id: enterpriseId,
      year: y,
      start_date: `${y}-01-01`,
      end_date: `${y}-12-31`,
      status: "abierto",
      is_default_period: false,
    }));
    if (periodRows.length > 0) {
      const { error } = await sb
        .from("tab_accounting_periods")
        .insert(periodRows);
      if (error) errors.push(`Períodos: ${error.message}`);
      else result.periodsCreated += periodRows.length;
    }
    const { data: perRows } = await sb
      .from("tab_accounting_periods")
      .select("id, year")
      .eq("enterprise_id", enterpriseId);
    const periodIdByYear = new Map<number, number>();
    perRows?.forEach((r: any) => periodIdByYear.set(r.year, r.id));

    // ---------- 3. Compras ----------
    await updateProgress("Importando compras...", 0, ds.purchases.length, true);
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
    for (const key of bookKeys) {
      const [y, m] = key.split("-").map(Number);
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

    for (const part of chunk(purchaseRows, CHUNK)) {
      const { error } = await sb.from("tab_purchase_ledger").insert(part);
      if (error) errors.push(`Compras: ${error.message}`);
      else result.purchasesCreated += part.length;
      await updateProgress(
        "Importando compras...",
        result.purchasesCreated,
        purchaseRows.length,
      );
    }

    // ---------- 4. Ventas ----------
    await updateProgress("Importando ventas...", 0, ds.sales.length, true);
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
    for (const part of chunk(salesRows, CHUNK)) {
      const { error } = await sb.from("tab_sales_ledger").insert(part);
      if (error) errors.push(`Ventas: ${error.message}`);
      else result.salesCreated += part.length;
      await updateProgress(
        "Importando ventas...",
        result.salesCreated,
        salesRows.length,
      );
    }

    // ---------- 5. Partidas (BATCH) ----------
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
    };
    const prepared: PreparedEntry[] = [];

    for (const entry of sortedEntries) {
      const [y, m] = entry.date.split("-").map(Number);
      const periodId = periodIdByYear.get(y);
      if (!periodId) continue;
      const lines = entry.lines
        .map((l) => ({
          ...l,
          accountId: accountIdByCode.get(l.accountCode),
        }))
        .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
      if (lines.length === 0) continue;

      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
      const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
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
        details: lines.map((l, idx) => ({
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
      });
    }

    let processed = 0;
    for (const batch of chunk(prepared, ENTRY_BATCH)) {
      // 1) insert headers en bulk
      const headersToInsert = batch.map((b) => b.header);
      const { data: insertedHeaders, error: hErr } = await sb
        .from("tab_journal_entries")
        .insert(headersToInsert)
        .select("id, entry_number");

      if (hErr || !insertedHeaders) {
        errors.push(`Lote partidas: ${hErr?.message ?? "sin respuesta"}`);
        processed += batch.length;
        await updateProgress(
          "Importando partidas...",
          processed,
          prepared.length,
        );
        continue;
      }

      // Mapear entry_number -> id
      const idByNumber = new Map<string, string>();
      insertedHeaders.forEach((h: any) => idByNumber.set(h.entry_number, h.id));

      // 2) armar detalles en bulk
      const allDetails: any[] = [];
      const balancedIds: string[] = [];
      for (const b of batch) {
        const id = idByNumber.get(b.header.entry_number);
        if (!id) continue;
        for (const d of b.details) {
          allDetails.push({ ...d, journal_entry_id: id });
        }
        result.journalEntriesCreated++;
        if (b.balanced) balancedIds.push(id);
      }

      // 3) insertar detalles en sub-lotes (cada partida ~5-10 líneas, así que 500 líneas ~50 partidas)
      for (const detPart of chunk(allDetails, CHUNK)) {
        const { error: dErr } = await sb
          .from("tab_journal_entry_details")
          .insert(detPart);
        if (dErr) errors.push(`Detalles lote: ${dErr.message}`);
      }

      // 4) marcar como contabilizadas las balanceadas
      if (balancedIds.length > 0) {
        const { error: pErr } = await sb
          .from("tab_journal_entries")
          .update({
            is_posted: true,
            status: "contabilizado",
            posted_at: new Date().toISOString(),
          })
          .in("id", balancedIds);
        if (pErr) {
          errors.push(`Posting lote: ${pErr.message}`);
          result.journalEntriesAsDraft += balancedIds.length;
        } else {
          result.journalEntriesPosted += balancedIds.length;
        }
      }
      result.journalEntriesAsDraft += batch.length - balancedIds.length;

      processed += batch.length;
      await updateProgress(
        "Importando partidas...",
        processed,
        prepared.length,
      );
    }

    // ---------- 6. Categorías de Activos Fijos ----------
    const categoryIdByLegacy = new Map<string, number>();
    if (ds.assetCategories.length > 0) {
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
    }

    // ---------- 7. Activos Fijos ----------
    if (ds.fixedAssets.length > 0) {
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
        assetRows.push({
          enterprise_id: enterpriseId,
          tenant_id: tenantId,
          asset_code: a.code,
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
        if (error) errors.push(`Activos: ${error.message}`);
        else result.fixedAssetsCreated += part.length;
        await updateProgress(
          "Importando activos fijos...",
          result.fixedAssetsCreated,
          assetRows.length,
        );
      }
    }

    // ---------- 8. Cerrar períodos ----------
    await updateProgress("Cerrando períodos...", 0, 1, true);
    await sb
      .from("tab_accounting_periods")
      .update({
        status: "cerrado",
        closed_at: new Date().toISOString(),
        closed_by: userId,
      })
      .eq("enterprise_id", enterpriseId);

    await sb
      .from("tab_legacy_import_jobs")
      .update({
        status: "completed",
        current_step: "Importación completa",
        current_count: 1,
        total_count: 1,
        finished_at: new Date().toISOString(),
        result,
        errors,
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
    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== "string") {
      return new Response(JSON.stringify({ error: "jobId requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Procesar en background — la respuesta sale ya
    // @ts-ignore EdgeRuntime es global en Supabase Edge
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

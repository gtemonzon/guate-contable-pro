import { supabase } from "@/integrations/supabase/client";
import { ParsedDataset, ParsedAccount, ParsedJournalEntry, ParsedPurchase, ParsedSale } from "./types";

export interface ImportProgress {
  step: string;
  current: number;
  total: number;
}

export interface ImportResult {
  accountsCreated: number;
  periodsCreated: number;
  purchasesCreated: number;
  salesCreated: number;
  journalEntriesCreated: number;
  journalEntriesPosted: number;
  journalEntriesAsDraft: number;
  errors: string[];
}

type Progress = (p: ImportProgress) => void;

const CHUNK = 500;

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
      return "deudora";
    case "pasivo":
    case "capital":
    case "ingreso":
      return "acreedora";
    default:
      return "deudora";
  }
}

/** Extrae años desde dataset (compras+ventas+partidas) */
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

/* ============================================================
   IMPORT
   ============================================================ */

export async function importLegacyData(
  enterpriseId: number,
  ds: ParsedDataset,
  accountsToImport: ParsedAccount[],
  onProgress: Progress
): Promise<ImportResult> {
  const result: ImportResult = {
    accountsCreated: 0,
    periodsCreated: 0,
    purchasesCreated: 0,
    salesCreated: 0,
    journalEntriesCreated: 0,
    journalEntriesPosted: 0,
    journalEntriesAsDraft: 0,
    errors: [],
  };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("No hay sesión");

  // ---------- 1. Cuentas ----------
  onProgress({ step: "Insertando cuentas...", current: 0, total: accountsToImport.length });

  // Reconstruir jerarquía: el padre es el código sin el último segmento
  // Pero como el sistema deriva nivel del código, simplemente respetamos
  // allowsMovement enviado y dejamos parent vacío al inicio.
  const accountRows = accountsToImport.map((a) => ({
    enterprise_id: enterpriseId,
    account_code: a.code,
    account_name: a.name,
    account_type: a.type,
    level: Math.max(1, Math.ceil(a.code.length / 2)), // estimación; se ajusta abajo
    allows_movement: a.allowsMovement,
    requires_cost_center: false,
    is_active: true,
    balance_type: inferBalanceType(a.type),
    is_bank_account: false,
    is_monetary: false,
  }));

  for (const part of chunk(accountRows, CHUNK)) {
    const { error } = await supabase.from("tab_accounts").insert(part);
    if (error) {
      result.errors.push(`Cuentas: ${error.message}`);
    } else {
      result.accountsCreated += part.length;
    }
    onProgress({ step: "Insertando cuentas...", current: result.accountsCreated, total: accountRows.length });
  }

  // Mapeo code -> id
  const { data: accRows } = await supabase
    .from("tab_accounts")
    .select("id, account_code")
    .eq("enterprise_id", enterpriseId);
  const accountIdByCode = new Map<string, number>();
  accRows?.forEach((r: any) => accountIdByCode.set(r.account_code, r.id));

  // ---------- 2. Períodos (anuales, abiertos para insertar) ----------
  const years = extractYears(ds);
  onProgress({ step: "Creando períodos...", current: 0, total: years.length });

  const periodRows = years.map((y) => ({
    enterprise_id: enterpriseId,
    year: y,
    start_date: `${y}-01-01`,
    end_date: `${y}-12-31`,
    status: "abierto" as const,
    is_default_period: false,
  }));

  for (const part of chunk(periodRows, CHUNK)) {
    const { error } = await supabase.from("tab_accounting_periods").insert(part);
    if (error) result.errors.push(`Períodos: ${error.message}`);
    else result.periodsCreated += part.length;
  }

  // Mapeo year -> period_id
  const { data: perRows } = await supabase
    .from("tab_accounting_periods")
    .select("id, year")
    .eq("enterprise_id", enterpriseId);
  const periodIdByYear = new Map<number, number>();
  perRows?.forEach((r: any) => periodIdByYear.set(r.year, r.id));

  // ---------- 3. Compras (con purchase_books mensual) ----------
  onProgress({ step: "Importando compras...", current: 0, total: ds.purchases.length });

  // crear/buscar purchase_books por (year, month)
  const bookKeys = new Set<string>();
  ds.purchases.forEach((p) => {
    if (!p.date) return;
    const [y, m] = p.date.split("-").map(Number);
    bookKeys.add(`${y}-${m}`);
  });
  const bookIdByYM = new Map<string, number>();
  for (const key of bookKeys) {
    const [y, m] = key.split("-").map(Number);
    const { data: bk } = await supabase
      .from("tab_purchase_books")
      .insert({ enterprise_id: enterpriseId, year: y, month: m, created_by: user.id })
      .select("id")
      .single();
    if (bk) bookIdByYM.set(key, bk.id);
  }

  const purchaseRows = ds.purchases.map((p) => {
    const [y, m] = p.date.split("-").map(Number);
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
      batch_reference: "IMPORT-LEGACY",
      idp_amount: 0,
    };
  });

  for (const part of chunk(purchaseRows, CHUNK)) {
    const { error } = await supabase.from("tab_purchase_ledger").insert(part);
    if (error) result.errors.push(`Compras: ${error.message}`);
    else result.purchasesCreated += part.length;
    onProgress({ step: "Importando compras...", current: result.purchasesCreated, total: purchaseRows.length });
  }

  // ---------- 4. Ventas ----------
  onProgress({ step: "Importando ventas...", current: 0, total: ds.sales.length });

  const salesRows = ds.sales.map((s) => {
    const [y] = s.date.split("-").map(Number);
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
    };
  });

  for (const part of chunk(salesRows, CHUNK)) {
    const { error } = await supabase.from("tab_sales_ledger").insert(part);
    if (error) result.errors.push(`Ventas: ${error.message}`);
    else result.salesCreated += part.length;
    onProgress({ step: "Importando ventas...", current: result.salesCreated, total: salesRows.length });
  }

  // ---------- 5. Partidas contables ----------
  onProgress({ step: "Importando partidas...", current: 0, total: ds.journalEntries.length });

  let entryCounter = 0;
  for (const entry of ds.journalEntries) {
    entryCounter++;
    const [y, m] = entry.date.split("-").map(Number);
    const periodId = periodIdByYear.get(y);
    if (!periodId) continue;

    // Resolver líneas con ID de cuenta
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

    const entryNumber = `IMP-${y}-${String(m).padStart(2, "0")}-${String(entryCounter).padStart(5, "0")}`;

    // Insertar header (siempre como borrador primero — protocolo de guardado)
    const { data: hdr, error: hErr } = await supabase
      .from("tab_journal_entries")
      .insert({
        enterprise_id: enterpriseId,
        accounting_period_id: periodId,
        entry_number: entryNumber,
        entry_date: entry.date,
        description: entry.description || "Importación legado",
        entry_type: "manual",
        document_reference: entry.reference || null,
        currency_code: "GTQ",
        exchange_rate: 1,
        total_debit: totalDebit,
        total_credit: totalCredit,
        is_posted: false,
        status: "borrador",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (hErr || !hdr) {
      result.errors.push(`Partida ${entryNumber}: ${hErr?.message ?? "sin id"}`);
      continue;
    }

    // Insertar detalles
    const detailRows = lines.map((l, idx) => ({
      journal_entry_id: hdr.id,
      line_number: idx + 1,
      account_id: l.accountId!,
      debit_amount: l.debit,
      credit_amount: l.credit,
      description: l.description || null,
      currency_code: "GTQ",
      exchange_rate: 1,
      original_debit: l.debit,
      original_credit: l.credit,
    }));

    const { error: dErr } = await supabase.from("tab_journal_entry_details").insert(detailRows);
    if (dErr) {
      result.errors.push(`Detalles ${entryNumber}: ${dErr.message}`);
      continue;
    }

    result.journalEntriesCreated++;

    if (balanced) {
      const { error: pErr } = await supabase
        .from("tab_journal_entries")
        .update({ is_posted: true, status: "publicado", posted_at: new Date().toISOString() })
        .eq("id", hdr.id);
      if (pErr) {
        result.errors.push(`Posting ${entryNumber}: ${pErr.message}`);
        result.journalEntriesAsDraft++;
      } else {
        result.journalEntriesPosted++;
      }
    } else {
      result.journalEntriesAsDraft++;
    }

    if (entryCounter % 25 === 0) {
      onProgress({ step: "Importando partidas...", current: entryCounter, total: ds.journalEntries.length });
    }
  }

  // ---------- 6. Cerrar todos los períodos ----------
  onProgress({ step: "Cerrando períodos...", current: 0, total: 1 });
  await supabase
    .from("tab_accounting_periods")
    .update({ status: "cerrado", closed_at: new Date().toISOString(), closed_by: user.id })
    .eq("enterprise_id", enterpriseId);

  onProgress({ step: "Importación completa", current: 1, total: 1 });
  return result;
}

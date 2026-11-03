/**
 * Libro de bancos: consultas y armado de filas, compartidos por el reporte
 * (ReporteLibroBancos) y el cajón lateral (BankLedgerDrawer).
 *
 * La lógica se movió tal cual desde ReporteLibroBancos.tsx: mismas consultas, mismo
 * orden y mismos cálculos.
 */
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRecords } from "@/utils/supabaseHelpers";
import { getFiscalFloorDate, applyFiscalFloor } from "@/utils/fiscalFloor";

export interface BankDocRow {
  date: string;
  document_number: string;
  beneficiary: string;
  concept: string;
  direction: string;
  debit: number;
  credit: number;
  status: string;
  journal_entry_number: string | null;
  journal_entry_id: number | null;
  source: "document" | "journal";
}

/** Montos de una línea de partida (saldo inicial sugerido). */
export interface MovementAmounts {
  debit_amount: number | null;
  credit_amount: number | null;
}

/** Documento bancario con el número de su partida, como lo trae la consulta. */
export interface BankDocumentQueryRow {
  document_date: string;
  document_number: string;
  beneficiary_name: string | null;
  concept: string | null;
  void_date: string | null;
  void_reason: string | null;
  direction: string;
  status: string;
  journal_entry_id: number | null;
  journal_entry: { entry_number: string } | null;
}

/** Línea de partida de la cuenta bancaria con su encabezado. */
export interface BankMovementQueryRow extends MovementAmounts {
  description: string | null;
  journal_entry: {
    id: number;
    entry_number: string;
    entry_date: string;
    description: string | null;
    bank_reference: string | null;
    beneficiary_name: string | null;
    bank_direction: string | null;
  } | null;
}

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  ISSUED: "Emitido",
  POSTED: "Contabilizado",
  VOID: "Anulado",
};

export const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  ISSUED: "outline",
  POSTED: "default",
  VOID: "destructive",
};

/**
 * Concepto de una fila VOID: "<concepto> — ANULADO el dd/mm/aaaa: <motivo>" (fecha real
 * de anulación). Las anulaciones antiguas guardaban "— ANULADO: <motivo>" dentro del
 * concepto; ese sufijo se quita para no duplicarlo.
 */
export function buildVoidConcept(concept: string | null, voidDate: string | null, voidReason: string | null): string {
  const base = (concept || "").replace(/\s*—\s*ANULADO:.*$/s, "").trim();
  const [y, m, d] = (voidDate || "").split("-");
  const when = voidDate ? ` el ${d}/${m}/${y}` : "";
  const reason = voidReason ? `: ${voidReason}` : "";
  return `${base ? `${base} — ` : ""}ANULADO${when}${reason}`;
}

/**
 * Filas del libro: primero los documentos bancarios (montos en 0; los VOID con su
 * concepto de anulación); luego cada movimiento contable: si su partida ya está
 * representada por un documento, actualiza los montos de ese documento; si no, se agrega
 * como fila "journal". Al final se aplica el filtro de estado ("ALL" no filtra) y se
 * ordena por fecha y luego por número de documento.
 */
export function mergeBankLedgerRows(
  documents: BankDocumentQueryRow[],
  movements: BankMovementQueryRow[],
  statusFilter: string,
): BankDocRow[] {
  const allRows: BankDocRow[] = [];

  for (const doc of documents) {
    const isVoid = doc.status === "VOID";
    allRows.push({
      date: doc.document_date,
      document_number: doc.document_number,
      beneficiary: doc.beneficiary_name || "",
      concept: isVoid ? buildVoidConcept(doc.concept, doc.void_date, doc.void_reason) : (doc.concept || ""),
      direction: doc.direction,
      debit: isVoid ? 0 : 0,
      credit: isVoid ? 0 : 0,
      status: doc.status,
      journal_entry_number: doc.journal_entry?.entry_number || null,
      journal_entry_id: doc.journal_entry_id || null,
      source: "document",
    });
  }

  for (const mov of movements) {
    const je = mov.journal_entry;
    if (!je) continue;

    // If this entry is already covered by a bank document, update amounts
    const existingIdx = allRows.findIndex(r => r.journal_entry_number === je.entry_number && r.source === "document");
    if (existingIdx !== -1) {
      allRows[existingIdx].debit = Number(mov.debit_amount) || 0;
      allRows[existingIdx].credit = Number(mov.credit_amount) || 0;
      continue;
    }

    // Add as journal-sourced row
    allRows.push({
      date: je.entry_date,
      document_number: je.bank_reference || je.entry_number,
      beneficiary: je.beneficiary_name || "",
      concept: je.description || mov.description || "",
      direction: je.bank_direction || (Number(mov.debit_amount) > 0 ? "IN" : "OUT"),
      debit: Number(mov.debit_amount) || 0,
      credit: Number(mov.credit_amount) || 0,
      status: "POSTED",
      journal_entry_number: je.entry_number,
      journal_entry_id: je.id,
      source: "journal",
    });
  }

  // Apply status filter to journal-sourced rows too
  const filtered = statusFilter === "ALL"
    ? allRows
    : allRows.filter(r => r.status === statusFilter);

  // Sort by date, then by document number
  filtered.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) return dateCompare;
    return a.document_number.localeCompare(b.document_number);
  });

  return filtered;
}

/** Saldo acumulado fila por fila a partir del saldo inicial. */
export function withRunningBalance(
  rows: BankDocRow[],
  openingBalance: number,
): (BankDocRow & { runningBalance: number })[] {
  let balance = openingBalance;
  return rows.map(r => {
    balance = balance + r.debit - r.credit;
    return { ...r, runningBalance: balance };
  });
}

/**
 * Consulta los documentos bancarios (solo si la cuenta contable tiene un registro en
 * tab_bank_accounts) y los movimientos contabilizados de la cuenta contable en el rango,
 * y devuelve las filas armadas con mergeBankLedgerRows.
 *
 * `includeMovements` (true por omisión) existe para que el reporte conserve su
 * comportamiento: solo consulta movimientos si la cuenta está en su lista de bancos.
 */
export async function fetchBankLedger({
  enterpriseId,
  bankGlAccountId,
  dateFrom,
  dateTo,
  statusFilter,
  includeMovements = true,
}: {
  enterpriseId: number;
  bankGlAccountId: number;
  dateFrom: string;
  dateTo: string;
  statusFilter: string;
  includeMovements?: boolean;
}): Promise<BankDocRow[]> {
  let documents: BankDocumentQueryRow[] = [];
  let movements: BankMovementQueryRow[] = [];

  // Resolve tab_bank_accounts record linked to this GL account (if any)
  const { data: linkedBankAcct } = await supabase
    .from("tab_bank_accounts")
    .select("id")
    .eq("account_id", bankGlAccountId)
    .eq("enterprise_id", enterpriseId)
    .maybeSingle();

  // 1. Fetch bank documents (only if a tab_bank_accounts record exists)
  if (linkedBankAcct) {
    let docQuery = supabase
      .from("tab_bank_documents")
      .select("*, journal_entry:tab_journal_entries!tab_bank_documents_journal_entry_id_fkey(entry_number)")
      .eq("enterprise_id", enterpriseId)
      .eq("bank_account_id", linkedBankAcct.id)
      .gte("document_date", dateFrom)
      .lte("document_date", dateTo)
      .order("document_date")
      .order("created_at");

    if (statusFilter !== "ALL") {
      docQuery = docQuery.eq("status", statusFilter);
    }

    documents = await fetchAllRecords<BankDocumentQueryRow>(docQuery);
  }

  // 2. Fetch journal entry movements affecting this bank's GL account
  if (includeMovements) {
    const jeQuery = supabase
      .from("tab_journal_entry_details")
      .select(`
        debit_amount, credit_amount, description,
        journal_entry:tab_journal_entries!inner(
          id, entry_number, entry_date, description, is_posted, status,
          bank_reference, beneficiary_name, bank_direction, enterprise_id
        )
      `)
      .eq("account_id", bankGlAccountId)
      .eq("journal_entry.enterprise_id", enterpriseId)
      .eq("journal_entry.is_posted", true)
      .gte("journal_entry.entry_date", dateFrom)
      .lte("journal_entry.entry_date", dateTo)
      .order("journal_entry(entry_date)");

    movements = await fetchAllRecords<BankMovementQueryRow>(jeQuery);
  }

  return mergeBankLedgerRows(documents, movements, statusFilter);
}

/**
 * Saldo inicial sugerido: movimientos contabilizados de la cuenta anteriores a
 * `dateFrom`, sin bajar del piso fiscal (la partida de apertura ya trae los saldos
 * anteriores), redondeado a 2 decimales.
 */
export async function fetchSuggestedOpeningBalance({
  enterpriseId,
  bankGlAccountId,
  dateFrom,
}: {
  enterpriseId: number;
  bankGlAccountId: number;
  dateFrom: string;
}): Promise<number> {
  const fiscalFloor = await getFiscalFloorDate(enterpriseId, dateFrom);

  const priorMovements = await fetchAllRecords<MovementAmounts>(
    applyFiscalFloor(
      supabase
        .from("tab_journal_entry_details")
        .select(`
          debit_amount, credit_amount,
          journal_entry:tab_journal_entries!inner(entry_date, is_posted, enterprise_id)
        `)
        .eq("account_id", bankGlAccountId)
        .eq("journal_entry.enterprise_id", enterpriseId)
        .eq("journal_entry.is_posted", true)
        .lt("journal_entry.entry_date", dateFrom),
      "journal_entry.entry_date",
      fiscalFloor
    )
  );

  const rawSum = (priorMovements || []).reduce(
    (sum, m) => sum + (Number(m.debit_amount) || 0) - (Number(m.credit_amount) || 0),
    0
  );
  return Math.round(rawSum * 100) / 100;
}

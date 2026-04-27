import * as XLSX from "xlsx";
import {
  ParsedAccount,
  ParsedDataset,
  ParsedJournalEntry,
  ParsedPurchase,
  ParsedSale,
  AccountTypeMap,
} from "./types";

/**
 * Limpia un NIT eliminando guiones, espacios y normalizando.
 * Por requerimiento del usuario: sin verificación, solo extracción.
 */
export function normalizeNit(raw: any): string {
  if (raw === null || raw === undefined) return "CF";
  const s = String(raw).trim().toUpperCase().replace(/[\s-]+/g, "");
  return s || "CF";
}

/**
 * Mapea el código de clasificación legacy a account_type del sistema.
 * 1=Activo, 2=Pasivo, 3=Capital, 4=Ingreso, 5=Gasto, 6=Costo
 * También acepta strings.
 */
function mapClassification(raw: any): AccountTypeMap {
  if (raw === null || raw === undefined) return "activo";
  const s = String(raw).trim().toLowerCase();
  const map: Record<string, AccountTypeMap> = {
    "1": "activo", activo: "activo", a: "activo",
    "2": "pasivo", pasivo: "pasivo", p: "pasivo",
    "3": "capital", capital: "capital", patrimonio: "capital", c: "capital",
    "4": "ingreso", ingreso: "ingreso", ingresos: "ingreso", i: "ingreso",
    "5": "gasto", gasto: "gasto", gastos: "gasto", g: "gasto",
    "6": "costo", costo: "costo", costos: "costo",
  };
  return map[s] ?? "activo";
}

/**
 * Mapea Clase numérica (1-7) a tipo de documento FEL.
 * 1=Factura, 2=Factura Especial, 3=Pólizas Importación, 4=NCRE, 5=NDEB, 6=Otros, 7=Factura Ventas
 */
function mapClaseToFel(raw: any): string {
  const n = parseInt(String(raw).trim());
  switch (n) {
    case 1: return "FACT";
    case 2: return "FESP";
    case 3: return "FACT"; // póliza importación se trata como factura
    case 4: return "NCRE";
    case 5: return "NDEB";
    case 6: return "OTRO";
    case 7: return "FACT";
    default: return "FACT";
  }
}

/** Convierte fecha de Excel/Access a YYYY-MM-DD */
function toIsoDate(raw: any): string {
  if (!raw) return "";
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  // Formatos como DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // ISO con tiempo
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

/** Saca clave normalizada (lower, sin tildes/espacios) */
const k = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function pickKey(row: any, candidates: string[]): any {
  const keys = Object.keys(row);
  const norm = new Map(keys.map((kk) => [k(kk), kk]));
  for (const c of candidates) {
    const found = norm.get(k(c));
    if (found !== undefined) return row[found];
  }
  return undefined;
}

// ============================================================
// PARSEO DE ROWS GENÉRICAS (Access o Excel devuelven lo mismo)
// ============================================================

function parseAccounts(rows: any[]): ParsedAccount[] {
  return rows.map((r) => {
    const code = String(pickKey(r, ["cuenta", "codigo", "codigo_cuenta", "account_code", "id"]) ?? "").trim();
    const name = String(pickKey(r, ["nombre", "descripcion", "nombre_cuenta", "account_name"]) ?? "").trim();
    const cls = pickKey(r, ["clasificacion", "tipo", "type"]);
    const mov = pickKey(r, ["movimiento", "permite_movimiento", "allows_movement", "es_detalle"]);
    const legacyId = pickKey(r, ["id", "id_cuenta", "idcuenta"]);
    const allowsMovement = mov === true || mov === 1 || mov === "1" || String(mov).toLowerCase() === "true" || String(mov).toLowerCase() === "si" || String(mov).toLowerCase() === "sí";
    return {
      code,
      name,
      type: mapClassification(cls),
      allowsMovement: mov === undefined ? code.length >= 6 : allowsMovement,
      legacyId,
    };
  }).filter((a) => a.code && a.name);
}

function parsePurchases(rows: any[]): ParsedPurchase[] {
  return rows.map((r) => ({
    date: toIsoDate(pickKey(r, ["fecha", "fecha_factura", "date"])),
    series: String(pickKey(r, ["serie", "series"]) ?? "").trim(),
    number: String(pickKey(r, ["numero", "numero_factura", "num_factura", "factura"]) ?? "").trim(),
    felDocType: mapClaseToFel(pickKey(r, ["clase", "tipo_documento", "tipo"])),
    supplierNit: normalizeNit(pickKey(r, ["nit", "nit_proveedor", "nit_emisor"])),
    supplierName: String(pickKey(r, ["proveedor", "nombre", "nombre_proveedor", "emisor"]) ?? "").trim(),
    netAmount: num(pickKey(r, ["base", "neto", "monto_base", "subtotal", "monto_neto"])),
    vatAmount: num(pickKey(r, ["iva", "vat"])),
    totalAmount: num(pickKey(r, ["total", "gran_total", "monto_total"])),
    authorizationNumber: String(pickKey(r, ["autorizacion", "numero_autorizacion", "authorization"]) ?? "").trim() || "IMPORTADO",
  })).filter((p) => p.date && p.totalAmount > 0);
}

function parseSales(rows: any[]): ParsedSale[] {
  return rows.map((r) => ({
    date: toIsoDate(pickKey(r, ["fecha", "fecha_factura", "date"])),
    series: String(pickKey(r, ["serie", "series"]) ?? "").trim(),
    number: String(pickKey(r, ["numero", "numero_factura", "num_factura", "factura"]) ?? "").trim(),
    felDocType: mapClaseToFel(pickKey(r, ["clase", "tipo_documento", "tipo"])),
    customerNit: normalizeNit(pickKey(r, ["nit", "nit_cliente", "nit_receptor"])),
    customerName: String(pickKey(r, ["cliente", "nombre", "nombre_cliente", "receptor"]) ?? "").trim(),
    netAmount: num(pickKey(r, ["base", "neto", "monto_base", "subtotal", "monto_neto"])),
    vatAmount: num(pickKey(r, ["iva", "vat"])),
    totalAmount: num(pickKey(r, ["total", "gran_total", "monto_total"])),
    authorizationNumber: String(pickKey(r, ["autorizacion", "numero_autorizacion", "authorization"]) ?? "").trim() || "IMPORTADO",
  })).filter((s) => s.date && s.totalAmount > 0);
}

function parseJournal(headers: any[], details: any[], accounts: ParsedAccount[]): ParsedJournalEntry[] {
  // Mapeo: legacyAccountId (ID Access) -> account_code
  const accountByLegacyId = new Map<string, string>();
  accounts.forEach((a) => {
    if (a.legacyId !== undefined && a.legacyId !== null) {
      accountByLegacyId.set(String(a.legacyId), a.code);
    }
    accountByLegacyId.set(a.code, a.code); // permite que legacyId sea ya el código
  });

  const detailsByEntry = new Map<string, any[]>();
  for (const d of details) {
    const eid = String(pickKey(d, ["id_diario", "iddiario", "diario_id", "partida", "id_partida", "header_id"]) ?? "");
    if (!eid) continue;
    if (!detailsByEntry.has(eid)) detailsByEntry.set(eid, []);
    detailsByEntry.get(eid)!.push(d);
  }

  return headers.map((h) => {
    const legacyId = pickKey(h, ["id", "id_diario", "iddiario", "id_partida"]);
    const date = toIsoDate(pickKey(h, ["fecha", "date"]));
    const description = String(pickKey(h, ["descripcion", "concepto", "description"]) ?? "Importación legado").trim();
    const reference = String(pickKey(h, ["referencia", "documento", "reference"]) ?? "").trim();
    const ds = detailsByEntry.get(String(legacyId)) || [];
    const lines = ds.map((d) => {
      const legacyAccountId = pickKey(d, ["cuenta", "id_cuenta", "idcuenta", "cuenta_id", "account_id"]);
      const accountCode = accountByLegacyId.get(String(legacyAccountId)) ?? String(legacyAccountId ?? "");
      return {
        accountCode,
        legacyAccountId,
        debit: num(pickKey(d, ["debe", "cargo", "debit"])),
        credit: num(pickKey(d, ["haber", "abono", "credit"])),
        description: String(pickKey(d, ["descripcion", "concepto"]) ?? "").trim(),
      };
    });
    return { legacyId, date, description, reference, lines };
  }).filter((e) => e.date && e.lines.length > 0);
}

function detectAccountLengths(accounts: ParsedAccount[]) {
  const result: Record<number, number> = {};
  for (const a of accounts) {
    const len = a.code.length;
    result[len] = (result[len] || 0) + 1;
  }
  return result;
}

// ============================================================
// LECTORES
// ============================================================

export async function parseMdb(file: File): Promise<ParsedDataset> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const reader = new MDBReader(Buffer.from(buf));

  const tableNames = reader.getTableNames();
  const findTable = (...names: string[]) => {
    for (const n of names) {
      const found = tableNames.find((t) => t.toLowerCase().replace(/_/g, "") === n.toLowerCase().replace(/_/g, ""));
      if (found) return reader.getTable(found).getData() as any[];
    }
    return [];
  };

  const accountsRows = findTable("tbl_cuentas", "cuentas", "tbl_catalogo");
  const purchasesRows = findTable("tbl_compras", "compras", "libro_compras");
  const salesRows = findTable("tbl_ventas", "ventas", "libro_ventas");
  const journalHeaders = findTable("tbl_diario", "diario", "tbl_partidas", "partidas");
  const journalDetails = findTable("tbl_diario_detalle", "diario_detalle", "tbl_partidas_detalle", "partidas_detalle", "detalle_diario");

  const accounts = parseAccounts(accountsRows);
  const purchases = parsePurchases(purchasesRows);
  const sales = parseSales(salesRows);
  const journalEntries = parseJournal(journalHeaders, journalDetails, accounts);

  return {
    accounts,
    purchases,
    sales,
    journalEntries,
    detectedAccountLengths: detectAccountLengths(accounts),
    source: "mdb",
  };
}

export async function parseXlsx(file: File): Promise<ParsedDataset> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const findSheet = (...names: string[]) => {
    for (const n of names) {
      const found = wb.SheetNames.find((s) => s.toLowerCase().replace(/[\s_]/g, "") === n.toLowerCase().replace(/[\s_]/g, ""));
      if (found) return XLSX.utils.sheet_to_json(wb.Sheets[found], { defval: null }) as any[];
    }
    return [];
  };

  const accountsRows = findSheet("tbl_cuentas", "cuentas", "catalogo");
  const purchasesRows = findSheet("tbl_compras", "compras", "librocompras");
  const salesRows = findSheet("tbl_ventas", "ventas", "libroventas");
  const journalHeaders = findSheet("tbl_diario", "diario", "partidas");
  const journalDetails = findSheet("tbl_diario_detalle", "diariodetalle", "partidasdetalle", "detalle");

  const accounts = parseAccounts(accountsRows);
  const purchases = parsePurchases(purchasesRows);
  const sales = parseSales(salesRows);
  const journalEntries = parseJournal(journalHeaders, journalDetails, accounts);

  return {
    accounts,
    purchases,
    sales,
    journalEntries,
    detectedAccountLengths: detectAccountLengths(accounts),
    source: "xlsx",
  };
}

export async function parseLegacyFile(file: File): Promise<ParsedDataset> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".mdb") || lower.endsWith(".accdb")) return parseMdb(file);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return parseXlsx(file);
  throw new Error("Formato no soportado. Usa .mdb, .accdb o .xlsx");
}

/**
 * Filtra cuentas según el nivel elegido por el usuario:
 * - "all": deja todas
 * - número: deja solo las de esa longitud (típicamente 6 = movimiento)
 * Marca como allowsMovement=true a las cuentas del nivel elegido.
 */
export function filterAccountsByLevel(accounts: ParsedAccount[], level: number | "all"): ParsedAccount[] {
  if (level === "all") return accounts;
  return accounts
    .filter((a) => a.code.length === level)
    .map((a) => ({ ...a, allowsMovement: true }));
}

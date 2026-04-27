import * as XLSX from "xlsx";
import {
  ParsedAccount,
  ParsedAssetCategory,
  ParsedDataset,
  ParsedFixedAsset,
  ParsedJournalEntry,
  ParsedPurchase,
  ParsedSale,
  AccountTypeMap,
} from "./types";

/** NIT sin guión, sin espacios, mayúsculas. Sin verificación. */
export function normalizeNit(raw: any): string {
  if (raw === null || raw === undefined) return "CF";
  const s = String(raw).trim().toUpperCase().replace(/[\s-]+/g, "");
  return s || "CF";
}

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

function mapClaseToFel(raw: any): string {
  const n = parseInt(String(raw).trim());
  switch (n) {
    case 1: return "FACT";
    case 2: return "FESP";
    case 3: return "FACT";
    case 4: return "NCRE";
    case 5: return "NDEB";
    case 6: return "OTRO";
    case 7: return "FACT";
    default: return "FACT";
  }
}

function toIsoDate(raw: any): string {
  if (!raw) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
}

function asBool(v: any): boolean {
  if (v === true) return true;
  if (v === 1 || v === "1") return true;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "verdadero" || s === "si" || s === "sí" || s === "yes";
}

const k = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

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
// PARSERS
// ============================================================

function parseAccounts(rows: any[]): ParsedAccount[] {
  return rows
    .map((r) => {
      const code = String(pickKey(r, ["cuenta", "codigo", "account_code"]) ?? "").trim();
      const name = String(pickKey(r, ["descripcion", "nombre", "account_name"]) ?? "").trim();
      const cls = pickKey(r, ["clasificacion", "tipo", "type"]);
      const mov = pickKey(r, ["movimiento", "permite_movimiento", "allows_movement"]);
      const legacyId = pickKey(r, ["idcuenta", "id_cuenta", "id"]);
      const parent = pickKey(r, ["padre", "parent"]);
      return {
        code,
        name,
        type: mapClassification(cls),
        allowsMovement: mov === undefined ? code.length >= 6 : asBool(mov),
        legacyId,
        parentLegacyId: parent !== undefined && String(parent).trim() !== "" && String(parent) !== "0" ? String(parent) : undefined,
      };
    })
    .filter((a) => a.code && a.name);
}

function parsePurchases(rows: any[]): ParsedPurchase[] {
  return rows
    .map((r) => {
      const bienes = num(pickKey(r, ["precio", "bienes"]));
      const servicios = num(pickKey(r, ["servicios"]));
      const activos = num(pickKey(r, ["activos", "activosfijos", "activos_fijos"]));
      const importaciones = num(pickKey(r, ["importaciones"]));
      const exentas = num(pickKey(r, ["exentas", "exento"]));
      const ivaRaw = num(pickKey(r, ["iva", "vat"]));

      // Determinar tipo de operación según en qué columna está el monto
      let operationTypeCode: ParsedPurchase["operationTypeCode"] = "BIENES";
      let netAmount = 0;
      let idpAmount = 0;
      if (activos > 0) { operationTypeCode = "ACTIVOS_FIJOS"; netAmount = activos; }
      else if (importaciones > 0) { operationTypeCode = "IMPORTACIONES"; netAmount = importaciones; }
      else if (servicios > 0) { operationTypeCode = "SERVICIOS"; netAmount = servicios; }
      else if (bienes > 0 && exentas > 0) {
        // Combustible: OTRAS + IDP en exentas
        operationTypeCode = "OTRAS";
        netAmount = bienes;
        idpAmount = exentas;
      }
      else if (bienes > 0) { operationTypeCode = "BIENES"; netAmount = bienes; }
      else if (exentas > 0) { operationTypeCode = "OTRAS"; netAmount = exentas; }

      const total = netAmount + idpAmount + ivaRaw;

      return {
        date: toIsoDate(pickKey(r, ["fecha", "fecha_factura", "date"])),
        series: String(pickKey(r, ["serie", "series"]) ?? "").trim(),
        number: String(pickKey(r, ["numerodoc", "numero", "numero_factura", "factura"]) ?? "").trim(),
        felDocType: mapClaseToFel(pickKey(r, ["clase", "tipo_documento"])),
        supplierNit: normalizeNit(pickKey(r, ["nit", "nit_proveedor"])),
        supplierName: String(pickKey(r, ["proveedor", "nombre", "nombre_proveedor"]) ?? "").trim(),
        netAmount,
        vatAmount: ivaRaw,
        totalAmount: total,
        idpAmount,
        operationTypeCode,
        authorizationNumber:
          String(pickKey(r, ["autorizacion", "numero_autorizacion"]) ?? "").trim() || "IMPORTADO",
        legacyAccountId: pickKey(r, ["idcuenta", "id_cuenta", "cuenta_id"]),
      };
    })
    .filter((p) => p.date && p.totalAmount > 0);
}

function parseSales(rows: any[]): { sales: ParsedSale[]; hasBranches: boolean } {
  let hasBranches = false;
  const sales = rows
    .map((r) => {
      const branchRaw = pickKey(r, ["idsucursal", "sucursal", "branch"]);
      const branch = branchRaw !== undefined && branchRaw !== null ? String(branchRaw).trim() : "0";
      if (branch && branch !== "0") hasBranches = true;

      const bienes = num(pickKey(r, ["precio", "bienes"]));
      const servicios = num(pickKey(r, ["servicios"]));
      const exentas = num(pickKey(r, ["exentas", "exento"]));
      const ivaRaw = num(pickKey(r, ["iva", "vat"]));

      // Determinar tipo de operación según en qué columna está el monto
      let operationTypeCode = "BIENES";
      let netAmount = 0;
      if (servicios > 0) { operationTypeCode = "SERVICIOS"; netAmount = servicios; }
      else if (bienes > 0) { operationTypeCode = "BIENES"; netAmount = bienes; }
      else if (exentas > 0) { operationTypeCode = "OTRAS"; netAmount = exentas; }

      const total = netAmount + ivaRaw;

      return {
        date: toIsoDate(pickKey(r, ["fecha", "fecha_factura", "date"])),
        series: String(pickKey(r, ["serie", "series"]) ?? "").trim(),
        number: String(pickKey(r, ["documentod", "numerodoc", "numero", "factura"]) ?? "").trim(),
        felDocType: mapClaseToFel(pickKey(r, ["clase", "tipo_documento"])),
        customerNit: normalizeNit(pickKey(r, ["nit", "nit_cliente"])),
        customerName: String(pickKey(r, ["cliente", "nombre", "nombre_cliente"]) ?? "").trim(),
        netAmount,
        vatAmount: ivaRaw,
        totalAmount: total,
        operationTypeCode,
        legacyAccountId: pickKey(r, ["idcuenta", "id_cuenta", "cuenta_id"]),
        authorizationNumber:
          String(pickKey(r, ["autorizacion", "numero_autorizacion"]) ?? "").trim() || "IMPORTADO",
        branchCode: branch && branch !== "0" ? branch : undefined,
      };
    })
    .filter((s) => s.date && s.totalAmount > 0);
  return { sales, hasBranches };
}

function parseJournal(
  headers: any[],
  details: any[],
  accounts: ParsedAccount[]
): ParsedJournalEntry[] {
  // Mapeo idCuenta legacy -> account_code
  const codeByLegacyId = new Map<string, string>();
  accounts.forEach((a) => {
    if (a.legacyId !== undefined && a.legacyId !== null) {
      codeByLegacyId.set(String(a.legacyId), a.code);
    }
    codeByLegacyId.set(a.code, a.code);
  });

  const detailsByEntry = new Map<string, any[]>();
  for (const d of details) {
    const eid = String(pickKey(d, ["npoliza", "id_diario", "iddiario", "id_partida"]) ?? "");
    if (!eid) continue;
    if (!detailsByEntry.has(eid)) detailsByEntry.set(eid, []);
    detailsByEntry.get(eid)!.push(d);
  }

  return headers
    .map((h) => {
      const legacyId = pickKey(h, ["npoliza", "idpoliza", "id"]);
      const date = toIsoDate(pickKey(h, ["fecha", "date"]));
      const description = String(
        pickKey(h, ["concepto", "descripcion", "description"]) ?? "Importación legado"
      ).trim();
      const reference = String(pickKey(h, ["documento", "referencia"]) ?? "").trim();
      const ds = detailsByEntry.get(String(legacyId)) || [];
      // Detectar si la hoja tiene la columna "mostrar"
      const hasMostrar = ds.some((d) =>
        Object.keys(d).some((kk) => k(kk) === k("mostrar"))
      );
      const lines = ds
        .filter((d) => {
          // Si existe la columna mostrar, exigir true (excluye padres acumulativos).
          if (hasMostrar) {
            const m = pickKey(d, ["mostrar"]);
            if (!asBool(m)) return false;
          }
          return true;
        })
        .map((d) => {
          // idcta es el FK al catálogo (tbl_cuentas.idCuenta). idctaDetalle apunta al padre.
          const legacyAccountId = pickKey(d, ["idcta", "id_cuenta", "cuenta_id"]);
          const codeRaw = pickKey(d, ["cuenta"]);
          const accountCode =
            codeByLegacyId.get(String(legacyAccountId)) ??
            (codeRaw !== undefined ? String(codeRaw) : "");
          return {
            accountCode,
            legacyAccountId,
            debit: num(pickKey(d, ["cargo", "debe", "debit"])),
            credit: num(pickKey(d, ["abono", "haber", "credit"])),
            description: String(pickKey(d, ["descripcion", "concepto"]) ?? "").trim(),
          };
        })
        .filter((l) => l.accountCode && (l.debit > 0 || l.credit > 0));
      return { legacyId, date, description, reference, lines };
    })
    .filter((e) => e.date && e.lines.length > 0);
}

function parseAssetCategories(rows: any[]): ParsedAssetCategory[] {
  return rows
    .map((r) => ({
      legacyId: pickKey(r, ["idregistro", "id"]) ?? "",
      code: String(pickKey(r, ["codigo", "code"]) ?? "").trim(),
      name: String(pickKey(r, ["nombrecuenta", "nombre", "name"]) ?? "").trim(),
      legacyAccountId: pickKey(r, ["idcuenta", "id_cuenta"]),
    }))
    .filter((c) => c.legacyId !== "" && c.name);
}

function parseFixedAssets(rows: any[]): ParsedFixedAsset[] {
  return rows
    .map((r, idx) => {
      const tiempoVida = num(pickKey(r, ["tiempovida", "vida_util", "useful_life"]));
      const unidadTiempo = String(pickKey(r, ["unidad_tiempo", "unidadtiempo"]) ?? "Años")
        .trim()
        .toLowerCase();
      const months =
        unidadTiempo.startsWith("a") ? Math.round(tiempoVida * 12) : Math.round(tiempoVida);
      const status = asBool(pickKey(r, ["status"])) ? "ACTIVE" : "DISPOSED";
      const codigo = String(pickKey(r, ["codact", "codigo", "code"]) ?? "").trim();
      const idEquipo = pickKey(r, ["idequipo", "id"]);
      return {
        code: codigo || `LEG-${idEquipo ?? idx + 1}`,
        name: String(pickKey(r, ["nombre", "name"]) ?? "Activo importado").trim(),
        serial: String(pickKey(r, ["serie", "serial"]) ?? "").trim() || undefined,
        model: String(pickKey(r, ["modelo", "model"]) ?? "").trim() || undefined,
        characteristics:
          String(pickKey(r, ["caracteristicas", "descripcion"]) ?? "").trim() || undefined,
        acquisitionDate: toIsoDate(pickKey(r, ["fecha_compra", "fecha_inicial"])),
        inServiceDate: toIsoDate(pickKey(r, ["fecha_inicial", "fecha_compra"])) || undefined,
        cost: num(pickKey(r, ["costo", "cost"])),
        residualValue: num(pickKey(r, ["valor_desecho", "residual"])),
        accumulatedDepreciation: num(pickKey(r, ["depreciacion"])),
        usefulLifeMonths: months > 0 ? months : 60,
        legacyCategoryId: pickKey(r, ["clasificacion", "category_id"]),
        status: status as "ACTIVE" | "DISPOSED",
      };
    })
    .filter((a) => a.acquisitionDate && a.cost > 0);
}

// ============================================================
// LECTOR XLSX
// ============================================================

export async function parseXlsx(file: File): Promise<ParsedDataset> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const findSheet = (...names: string[]) => {
    for (const n of names) {
      const found = wb.SheetNames.find(
        (s) => k(s) === k(n)
      );
      if (found) return XLSX.utils.sheet_to_json(wb.Sheets[found], { defval: null }) as any[];
    }
    return [];
  };

  const accountsRows = findSheet("tbl_cuentas", "cuentas", "catalogo");
  const purchasesRows = findSheet("tbl_compras", "compras");
  const salesRows = findSheet("tbl_ventas", "ventas");
  const journalHeaders = findSheet("tbl_diario", "diario");
  const journalDetails = findSheet("tbl_diario_Detalle", "tbl_diario_detalle", "diario_detalle");
  const groupRows = findSheet("tbl_grupoActivos", "tbl_grupoactivos", "grupo_activos");
  const assetRows = findSheet(
    "tbl_ActivosFijo",
    "tbl_activosfijo",
    "tbl_activosfijos",
    "tbl_maestroActivosFijos",
    "activos_fijos"
  );

  const accounts = parseAccounts(accountsRows);
  const purchases = parsePurchases(purchasesRows);
  const { sales, hasBranches } = parseSales(salesRows);
  const journalEntries = parseJournal(journalHeaders, journalDetails, accounts);
  const assetCategories = parseAssetCategories(groupRows);
  const fixedAssets = parseFixedAssets(assetRows);

  return {
    accounts,
    purchases,
    sales,
    journalEntries,
    assetCategories,
    fixedAssets,
    hasBranches,
    source: "xlsx",
  };
}

export async function parseLegacyFile(file: File): Promise<ParsedDataset> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return parseXlsx(file);
  throw new Error("Formato no soportado. Usa .xlsx");
}

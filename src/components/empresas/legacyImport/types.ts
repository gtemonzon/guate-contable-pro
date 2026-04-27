// Tipos compartidos para el wizard de importación legado (Excel multi-hoja)

export type AccountTypeMap = "activo" | "pasivo" | "capital" | "ingreso" | "gasto" | "costo";

export interface ParsedAccount {
  code: string;
  name: string;
  type: AccountTypeMap;
  allowsMovement: boolean;
  legacyId?: string | number; // idCuenta original
  parentLegacyId?: string | number; // padre (código) opcional
}

export interface ParsedPurchase {
  date: string;
  series: string;
  number: string;
  felDocType: string;
  supplierNit: string;
  supplierName: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  authorizationNumber?: string;
  legacyAccountId?: string | number; // idCuenta de la cuenta de gasto/compra
}

export interface ParsedSale {
  date: string;
  series: string;
  number: string;
  felDocType: string;
  customerNit: string;
  customerName: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  authorizationNumber?: string;
  branchCode?: string; // IdSucursal (0 = sin sucursal)
}

export interface ParsedJournalLine {
  accountCode: string;
  legacyAccountId?: string | number;
  debit: number;
  credit: number;
  description?: string;
}

export interface ParsedJournalEntry {
  legacyId?: string | number;
  date: string;
  description: string;
  reference?: string;
  lines: ParsedJournalLine[];
}

export interface ParsedFixedAsset {
  code: string;
  name: string;
  serial?: string;
  model?: string;
  characteristics?: string;
  acquisitionDate: string; // YYYY-MM-DD
  inServiceDate?: string;
  cost: number;
  residualValue: number;
  accumulatedDepreciation: number;
  usefulLifeMonths: number; // tiempoVida convertido
  legacyCategoryId?: string | number; // clasificacion -> tbl_grupoActivos.IdRegistro
  status: "ACTIVE" | "DISPOSED";
}

export interface ParsedAssetCategory {
  legacyId: string | number; // IdRegistro
  code: string;
  name: string;
  legacyAccountId?: string | number; // idCuenta de la cuenta del activo
}

export interface ParsedDataset {
  accounts: ParsedAccount[];
  purchases: ParsedPurchase[];
  sales: ParsedSale[];
  journalEntries: ParsedJournalEntry[];
  assetCategories: ParsedAssetCategory[];
  fixedAssets: ParsedFixedAsset[];
  hasBranches: boolean;
  source: "xlsx";
}

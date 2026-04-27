// Tipos compartidos para el wizard de importación legado (Microsoft Access)

export type AccountTypeMap = "activo" | "pasivo" | "capital" | "ingreso" | "gasto" | "costo";

export interface ParsedAccount {
  code: string;            // account_code normalizado (ej. "1101")
  name: string;            // account_name
  type: AccountTypeMap;    // mapeado desde clasificacion
  allowsMovement: boolean; // detalle vs título
  legacyId?: string | number; // ID original en Access (para resolver FKs en el diario)
}

export interface ParsedPurchase {
  date: string;             // YYYY-MM-DD
  series: string;
  number: string;
  felDocType: string;       // FACT, FCAM, NCRE, ...
  supplierNit: string;      // sin guión
  supplierName: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  authorizationNumber?: string;
}

export interface ParsedSale {
  date: string;
  series: string;
  number: string;
  felDocType: string;
  customerNit: string;      // sin guión
  customerName: string;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  authorizationNumber?: string;
}

export interface ParsedJournalLine {
  accountCode: string;      // resuelto a partir del legacy account id
  legacyAccountId?: string | number;
  debit: number;
  credit: number;
  description?: string;
}

export interface ParsedJournalEntry {
  legacyId?: string | number;
  date: string;             // YYYY-MM-DD
  description: string;
  reference?: string;
  lines: ParsedJournalLine[];
}

export interface ParsedDataset {
  accounts: ParsedAccount[];
  purchases: ParsedPurchase[];
  sales: ParsedSale[];
  journalEntries: ParsedJournalEntry[];
  // Diagnóstico
  detectedAccountLengths: Record<number, number>; // {4: 50, 6: 280}
  source: "mdb" | "xlsx";
}

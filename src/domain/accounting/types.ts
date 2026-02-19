/**
 * Core domain types for accounting calculations.
 * These are pure data types with no framework dependencies.
 */

export interface AccountRecord {
  id: number;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  balance_type: BalanceType | null;
}

export type AccountType = 'activo' | 'pasivo' | 'patrimonio' | 'ingreso' | 'gasto';
export type BalanceType = 'deudor' | 'acreedor' | 'indiferente';

export interface MovementRecord {
  account_id: number;
  debit_amount: number;
  credit_amount: number;
}

export interface AccountBalance extends AccountRecord {
  balance: number;
}

export interface PeriodRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface KPIData {
  totalActivos: KPIMetric;
  totalPasivos: KPIMetric;
  utilidadPeriodo: KPIMetric;
  liquidez: KPIMetric;
}

export interface KPIMetric {
  value: number;
  change: number | null;
  trend: 'up' | 'down' | 'neutral';
}

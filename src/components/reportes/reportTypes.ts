export interface ReportLine {
  type: 'section' | 'account' | 'subtotal' | 'total' | 'calculated';
  label: string;
  amount: number;
  level?: number;
  accountLevel?: number;
  isBold?: boolean;
  showLine?: boolean;
  accountId?: number;
  accountCode?: string;
  parentAccountId?: number | null;
  hasChildren?: boolean;
}

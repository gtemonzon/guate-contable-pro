import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Eye, EyeOff } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseRecord } from "./PurchaseLinkManager";

interface PurchaseLinkSummaryProps {
  linkedPurchases: PurchaseRecord[];
  entryStatus: string;
  journalEntryNumber: string;
  bankAccountId?: number | null;
  accounts: Array<{ id: number; account_code: string; account_name: string }>;
  onApplyToEntry?: () => Promise<void> | void;
  applying?: boolean;
  hasPendingChanges?: boolean;
}

interface PreviewLine {
  account: string;
  debit: number;
  credit: number;
}

export function PurchaseLinkSummary({
  linkedPurchases,
  entryStatus,
  journalEntryNumber,
  bankAccountId,
  accounts,
  onApplyToEntry,
  applying = false,
  hasPendingChanges = false,
}: PurchaseLinkSummaryProps) {
  const [showPreview, setShowPreview] = useState(false);

  const totals = useMemo(() => {
    const totalIva = linkedPurchases.reduce((s, p) => s + (p.vat_amount || 0), 0);
    const totalAmount = linkedPurchases.reduce((s, p) => s + p.total_amount, 0);
    const totalBase = totalAmount - totalIva;
    return { base: totalBase, iva: totalIva, total: totalAmount };
  }, [linkedPurchases]);

  const previewLines = useMemo<PreviewLine[]>(() => {
    if (linkedPurchases.length === 0) return [];

    const expenseMap = new Map<number | null, number>();
    let totalIva = 0;

    for (const p of linkedPurchases) {
      const base = p.total_amount - (p.vat_amount || 0);
      const key = p.expense_account_id;
      expenseMap.set(key, (expenseMap.get(key) || 0) + base);
      totalIva += p.vat_amount || 0;
    }

    const lines: PreviewLine[] = [];

    for (const [acctId, amount] of expenseMap) {
      const acct = acctId ? accounts.find(a => a.id === acctId) : null;
      lines.push({
        account: acct ? `${acct.account_code} ${acct.account_name}` : "Cuenta gasto (sin asignar)",
        debit: amount,
        credit: 0,
      });
    }

    if (totalIva > 0) {
      lines.push({ account: "IVA Crédito Fiscal", debit: totalIva, credit: 0 });
    }

    const totalHaber = totals.total;
    if (bankAccountId) {
      const bankAcct = accounts.find(a => a.id === bankAccountId);
      lines.push({ account: bankAcct ? `${bankAcct.account_code} ${bankAcct.account_name}` : "Banco", debit: 0, credit: totalHaber });
    } else {
      lines.push({ account: "Cuentas por Pagar", debit: 0, credit: totalHaber });
    }

    return lines;
  }, [linkedPurchases, bankAccountId, accounts, totals.total]);

  const statusLabel = entryStatus === 'contabilizado'
    ? `Póliza: ${journalEntryNumber}`
    : linkedPurchases.length === 0
      ? "Borrador (sin líneas)"
      : "Borrador";

  const statusVariant = entryStatus === 'contabilizado' ? 'default' as const : 'secondary' as const;

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant} className="text-[10px]">{statusLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            {linkedPurchases.length} factura{linkedPurchases.length !== 1 ? 's' : ''} vinculada{linkedPurchases.length !== 1 ? 's' : ''}
          </span>
        </div>

        {linkedPurchases.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-muted-foreground">Base: <span className="text-foreground font-medium">{formatCurrency(totals.base)}</span></span>
            <span className="text-muted-foreground">IVA: <span className="text-foreground font-medium">{formatCurrency(totals.iva)}</span></span>
            <Separator orientation="vertical" className="h-3" />
            <span className="text-muted-foreground">Total: <span className="text-foreground font-semibold">{formatCurrency(totals.total)}</span></span>
          </div>
        )}
      </div>

      {linkedPurchases.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowPreview(prev => !prev)}
          >
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? "Ocultar preview" : "Preview asiento"}
          </Button>
        </div>
      )}

      {showPreview && previewLines.length > 0 && (
        <div className="rounded-md border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Cuenta</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-28">Debe</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground w-28">Haber</th>
              </tr>
            </thead>
            <tbody>
              {previewLines.map((line, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  <td className="py-1.5 px-2 truncate max-w-[200px]">{line.account}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{line.debit > 0 ? formatCurrency(line.debit) : ''}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{line.credit > 0 ? formatCurrency(line.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-medium">
                <td className="py-1.5 px-2">Totales</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatCurrency(previewLines.reduce((s, l) => s + l.debit, 0))}</td>
                <td className="py-1.5 px-2 text-right font-mono">{formatCurrency(previewLines.reduce((s, l) => s + l.credit, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

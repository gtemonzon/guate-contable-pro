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
  felDocTypes: Array<{ code: string; name: string; affects_total: number; applies_vat: boolean }>;
  onApplyToEntry?: () => Promise<void> | void;
  applying?: boolean;
  hasPendingChanges?: boolean;
}

interface PreviewLine {
  account: string;
  debit: number;
  credit: number;
}

const EXEMPT_DOC_TYPES = new Set(["FPEQ", "FESP", "NABN", "RDON", "RECI"]);

export function PurchaseLinkSummary({
  linkedPurchases,
  entryStatus,
  journalEntryNumber,
  bankAccountId,
  accounts,
  felDocTypes,
}: PurchaseLinkSummaryProps) {
  const [showPreview, setShowPreview] = useState(false);

  const docTypeMap = useMemo(() => {
    return felDocTypes.reduce<Record<string, { multiplier: number; appliesVat: boolean }>>((acc, dt) => {
      acc[dt.code] = {
        multiplier: dt.affects_total ?? 1,
        appliesVat: dt.applies_vat ?? true,
      };
      return acc;
    }, {});
  }, [felDocTypes]);

  const getSignedAmounts = (p: PurchaseRecord) => {
    const fallbackMultiplier = p.fel_document_type === "NCRE" ? -1 : 1;
    const meta = docTypeMap[p.fel_document_type] || { multiplier: fallbackMultiplier, appliesVat: true };
    const isExempt = EXEMPT_DOC_TYPES.has(p.fel_document_type || "FACT") || !meta.appliesVat;

    const total = (p.total_amount || 0) * meta.multiplier;
    const iva = isExempt ? 0 : (p.vat_amount || 0) * meta.multiplier;
    const base = total - iva;

    return { base, iva, total };
  };

  const totals = useMemo(() => {
    return linkedPurchases.reduce(
      (acc, purchase) => {
        const signed = getSignedAmounts(purchase);
        acc.base += signed.base;
        acc.iva += signed.iva;
        acc.total += signed.total;
        return acc;
      },
      { base: 0, iva: 0, total: 0 }
    );
  }, [linkedPurchases, docTypeMap]);

  const previewLines = useMemo<PreviewLine[]>(() => {
    if (linkedPurchases.length === 0) return [];

    const expenseMap = new Map<number | null, number>();
    let totalIva = 0;

    for (const p of linkedPurchases) {
      const signed = getSignedAmounts(p);
      const key = p.expense_account_id;
      expenseMap.set(key, (expenseMap.get(key) || 0) + signed.base);
      totalIva += signed.iva;
    }

    const lines: PreviewLine[] = [];

    for (const [acctId, amount] of expenseMap) {
      const acct = acctId ? accounts.find((a) => a.id === acctId) : null;
      lines.push({
        account: acct ? `${acct.account_code} ${acct.account_name}` : "Cuenta gasto (sin asignar)",
        debit: amount >= 0 ? amount : 0,
        credit: amount < 0 ? Math.abs(amount) : 0,
      });
    }

    if (totalIva > 0) {
      lines.push({ account: "IVA Crédito Fiscal", debit: totalIva, credit: 0 });
    }

    const totalContra = totals.total;
    const contraLine: PreviewLine = {
      account: bankAccountId
        ? (accounts.find((a) => a.id === bankAccountId)
            ? `${accounts.find((a) => a.id === bankAccountId)!.account_code} ${accounts.find((a) => a.id === bankAccountId)!.account_name}`
            : "Banco")
        : "Cuentas por Pagar",
      debit: totalContra < 0 ? Math.abs(totalContra) : 0,
      credit: totalContra >= 0 ? totalContra : 0,
    };

    lines.push(contraLine);

    return lines;
  }, [linkedPurchases, bankAccountId, accounts, totals.total, docTypeMap]);

  const statusLabel = entryStatus === "contabilizado"
    ? `Póliza: ${journalEntryNumber}`
    : linkedPurchases.length === 0
      ? "Borrador (sin líneas)"
      : "Borrador";

  const statusVariant = entryStatus === "contabilizado" ? "default" as const : "secondary" as const;

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2 shrink-0">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant} className="text-[10px]">{statusLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            {linkedPurchases.length} factura{linkedPurchases.length !== 1 ? "s" : ""} vinculada{linkedPurchases.length !== 1 ? "s" : ""}
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
            onClick={() => setShowPreview((prev) => !prev)}
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
                  <td className="py-1.5 px-2 text-right font-mono">{line.debit > 0 ? formatCurrency(line.debit) : ""}</td>
                  <td className="py-1.5 px-2 text-right font-mono">{line.credit > 0 ? formatCurrency(line.credit) : ""}</td>
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

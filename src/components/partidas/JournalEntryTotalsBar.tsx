import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface JournalEntryTotalsBarProps {
  show: boolean;
  nextEntryNumber: string;
  entryDate: string;
  entryType: string;
  headerDescription: string;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export function JournalEntryTotalsBar({
  show, nextEntryNumber, entryDate, entryType, headerDescription, totalDebit, totalCredit, isBalanced,
}: JournalEntryTotalsBarProps) {
  if (!show) return null;

  return (
    <div className="sticky top-0 z-50 bg-muted/80 backdrop-blur-sm border-b shadow-sm py-2 px-4 -mx-6 -mt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="font-mono text-xs">{nextEntryNumber || 'Sin asignar'}</Badge>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">
            {entryDate ? new Date(entryDate + 'T00:00:00').toLocaleDateString('es-GT') : 'Sin fecha'}
          </span>
          <span className="text-muted-foreground">•</span>
          <Badge variant="secondary" className="text-xs capitalize">{entryType || 'Sin tipo'}</Badge>
          {headerDescription && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="truncate max-w-[200px] text-muted-foreground" title={headerDescription}>{headerDescription}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm font-medium">
          <span>Debe: <span className="font-mono">Q{formatCurrency(totalDebit)}</span></span>
          <span>Haber: <span className="font-mono">Q{formatCurrency(totalCredit)}</span></span>
          {isBalanced && totalDebit > 0 ? (
            <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50 dark:bg-green-950/20">✓ Balanceada</Badge>
          ) : totalDebit > 0 ? (
            <Badge variant="destructive" className="text-xs">Dif: Q{formatCurrency(Math.abs(totalDebit - totalCredit))}</Badge>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import type { ImportSelectionSummary } from "@/utils/purchaseImportSelection";

const formatCurrency = (amount: number) =>
  amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface ImportSelectionBarProps {
  summary: ImportSelectionSummary;
  overwriteDuplicates: boolean;
}

/** Resumen en vivo de la selección del importador (fijo arriba de la región con scroll). */
export function ImportSelectionBar({ summary, overwriteDuplicates }: ImportSelectionBarProps) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-3 py-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span>
        Nuevas seleccionadas <strong>{summary.selectedCount}</strong> de {summary.newCount}
      </span>
      <span className="font-mono font-semibold text-primary">Q{formatCurrency(summary.selectedTotal)}</span>
      <span className="text-muted-foreground">
        Ya cargadas <strong className="text-foreground">{summary.loadedCount}</strong>
      </span>
      {overwriteDuplicates && (
        <span className="text-muted-foreground">
          Se sobrescribirán <strong className="text-foreground">{summary.toOverwriteCount}</strong>
        </span>
      )}
      <span className="ml-auto font-medium">A importar: {summary.toImportCount}</span>
    </div>
  );
}

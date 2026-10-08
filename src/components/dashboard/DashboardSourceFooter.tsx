import { AlertTriangle } from "lucide-react";

/** "dd/MM/yyyy HH:mm" en hora local. */
const formatSavedAt = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface DashboardSourceFooterProps {
  source: "saved" | "estimate";
  savedAt: string | null;
  stale: boolean;
  /** Texto cuando no hay cálculo guardado. */
  estimateText: string;
}

/**
 * Pie de las tarjetas de impuestos del Dashboard: de dónde salen los números (cálculo
 * guardado del Generador o estimación con libros) y si los libros cambiaron desde ese
 * cálculo.
 */
export function DashboardSourceFooter({ source, savedAt, stale, estimateText }: DashboardSourceFooterProps) {
  if (source === "saved" && savedAt) {
    return (
      <div className="space-y-1 pt-1">
        <p className="text-[10px] text-muted-foreground leading-tight">
          Según cálculo del {formatSavedAt(savedAt)}
        </p>
        {stale && (
          <p className="flex items-start gap-1 text-[10px] leading-tight text-warning">
            <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
            Los libros cambiaron desde ese cálculo. Vuelve a generarlo.
          </p>
        )}
      </div>
    );
  }
  return (
    <p className="text-[10px] text-muted-foreground leading-tight pt-1">
      {estimateText}
    </p>
  );
}

/** 'YYYY-MM-DD' → 'dd/MM/yyyy'. */
const formatDateOnly = (value: string): string => {
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

interface DashboardPresentedLineProps {
  presented: { formNumber: string; amountPaid: number; paymentDate: string | null } | null;
  /** Formato del monto (cada tarjeta usa el suyo). */
  formatAmount: (value: number) => string;
}

/** "Presentado el dd/MM/yyyy — Q<monto> (formulario <número>)" cuando el formulario ya está registrado. */
export function DashboardPresentedLine({ presented, formatAmount }: DashboardPresentedLineProps) {
  if (!presented) return null;
  return (
    <p className="text-xs text-success">
      Presentado{presented.paymentDate ? ` el ${formatDateOnly(presented.paymentDate)}` : ""} — Q{formatAmount(presented.amountPaid)}
      {" "}(formulario {presented.formNumber})
    </p>
  );
}

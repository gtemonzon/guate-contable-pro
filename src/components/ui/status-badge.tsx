import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Lock,
  FileText,
  Loader2,
} from "lucide-react";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border",
  {
    variants: {
      status: {
        draft: "bg-muted text-muted-foreground border-muted-foreground/30",
        pending: "bg-warning/15 text-warning border-warning/40",
        posted: "bg-success/15 text-success border-success/30",
        closed: "bg-secondary/20 text-secondary-foreground border-secondary/40",
        error: "bg-destructive/15 text-destructive border-destructive/30",
        active: "bg-primary/15 text-primary border-primary/30",
        disposed: "bg-muted text-muted-foreground border-muted-foreground/30",
        planned: "bg-accent text-accent-foreground border-accent-foreground/20",
        skipped: "bg-muted/50 text-muted-foreground border-muted-foreground/20",
        reconciled: "bg-success/15 text-success border-success/30",
        unmatched: "bg-warning/15 text-warning border-warning/40",
      },
    },
    defaultVariants: {
      status: "draft",
    },
  }
);

const STATUS_ICONS: Record<string, React.ElementType> = {
  draft: FileText,
  pending: Clock,
  posted: CheckCircle2,
  closed: Lock,
  error: XCircle,
  active: CheckCircle2,
  disposed: XCircle,
  planned: Loader2,
  skipped: AlertTriangle,
  reconciled: CheckCircle2,
  unmatched: AlertTriangle,
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending: "Pendiente",
  posted: "Contabilizado",
  closed: "Cerrado",
  error: "Error",
  active: "Activo",
  disposed: "Dado de baja",
  planned: "Planificado",
  skipped: "Omitido",
  reconciled: "Conciliado",
  unmatched: "Sin conciliar",
  // Spanish aliases
  borrador: "Borrador",
  abierto: "Abierto",
  cerrado: "Cerrado",
  contabilizado: "Contabilizado",
  activo: "Activo",
  inactivo: "Inactivo",
  vendido: "Vendido",
  ACTIVE: "Activo",
  DRAFT: "Borrador",
  DISPOSED: "Dado de baja",
  SOLD: "Vendido",
  PLANNED: "Planificado",
  POSTED: "Contabilizado",
  SKIPPED: "Omitido",
};

type StatusKey = VariantProps<typeof statusBadgeVariants>["status"];

/** Map arbitrary string status values to our variant keys */
function normalizeStatus(status: string): StatusKey {
  const lower = status.toLowerCase();
  const map: Record<string, StatusKey> = {
    draft: "draft",
    borrador: "draft",
    pending: "pending",
    pendiente: "pending",
    posted: "posted",
    contabilizado: "posted",
    closed: "closed",
    cerrado: "closed",
    abierto: "active",
    open: "active",
    error: "error",
    active: "active",
    activo: "active",
    disposed: "disposed",
    sold: "disposed",
    vendido: "disposed",
    inactivo: "closed",
    inactive: "closed",
    planned: "planned",
    skipped: "skipped",
    reconciled: "reconciled",
    unmatched: "unmatched",
  };
  return map[lower] ?? "draft";
}

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: string;
  showIcon?: boolean;
  label?: string;
}

export function StatusBadge({
  status,
  showIcon = true,
  label,
  className,
  ...props
}: StatusBadgeProps) {
  const normalized = normalizeStatus(status);
  const Icon = STATUS_ICONS[normalized ?? "draft"] ?? FileText;
  const displayLabel = label ?? STATUS_LABELS[status] ?? STATUS_LABELS[normalized ?? "draft"] ?? status;

  return (
    <div
      className={cn(statusBadgeVariants({ status: normalized }), className)}
      {...props}
    >
      {showIcon && <Icon className="h-3 w-3 shrink-0" />}
      <span>{displayLabel}</span>
    </div>
  );
}

// ── Inline validation warning ──────────────────────────────────────────────

export interface ValidationAlertProps {
  type: "error" | "warning" | "info" | "success";
  message: string;
  className?: string;
}

const alertColors = {
  error:   "bg-destructive/10 border-destructive/30 text-destructive",
  warning: "bg-warning/10 border-warning/30 text-warning",
  info:    "bg-primary/10 border-primary/20 text-primary",
  success: "bg-success/10 border-success/30 text-success",
};

const AlertIcons = {
  error: XCircle,
  warning: AlertTriangle,
  info: FileText,
  success: CheckCircle2,
};

export function ValidationAlert({ type, message, className }: ValidationAlertProps) {
  const Icon = AlertIcons[type];
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        alertColors[type],
        className
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ── Success confirmation toast helper ──────────────────────────────────────
export function successMessage(entryNumber: string, amount: number): string {
  const fmt = new Intl.NumberFormat("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `Partida ${entryNumber} contabilizada — Débito = Crédito = Q ${fmt.format(amount)}`;
}

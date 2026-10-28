import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, ChevronDown, Pencil, Trash2, Circle, Plus, Users, FolderPlus, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Database } from "@/integrations/supabase/types";
import { getClickableRowProps } from "@/utils/clickableRow";
import { groupsToExpand } from "@/utils/accountCatalogView";

type Account = Database['public']['Tables']['tab_accounts']['Row'];

type InlineField = 'account_type' | 'balance_type' | 'allows_movement';

interface AccountTreeViewProps {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onDelete: (
    account: Account,
    childrenIds: number[],
    onProgress?: (current: number, total: number, currentName: string) => void
  ) => Promise<{ canDelete: boolean; message?: string; deletedCount?: number }>;
  onQuickCreate?: (referenceAccount: Account, createType: 'sibling' | 'child') => void;
  onInlineUpdate?: (
    accountId: number,
    field: InlineField,
    newValue: string | boolean
  ) => Promise<{ ok: boolean; message?: string }>;
  /** Nivel máximo visible por omisión (null = todos). */
  levelLimit: number | null;
  /** Expande todos los grupos (búsqueda o rubro activos). */
  autoExpandAll: boolean;
}

/** Columnas: Código | Nombre | Tipo | Saldo | Movimiento | Acciones (Saldo y Movimiento ocultas < md). */
const ROW_GRID =
  "grid grid-cols-[110px_minmax(0,1fr)_120px_112px] md:grid-cols-[150px_minmax(0,1fr)_130px_60px_110px_112px]";

const HOVER_REVEAL = "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 transition-opacity";

function groupRowClass(level: number): string {
  if (level <= 1) return "bg-tenant-tint-1 border-l-tenant-solid-1";
  if (level === 2) return "bg-tenant-tint-2 border-l-tenant-solid-2";
  if (level === 3) return "bg-tenant-tint-3 border-l-tenant-solid-2/60";
  return "bg-tenant-tint-4 border-l-tenant-solid-2/30";
}

function levelBadgeClass(level: number): string {
  if (level <= 1) return "bg-tenant-solid-1 text-tenant-solid-1-foreground hover:bg-tenant-solid-1";
  if (level === 2) return "bg-tenant-solid-2 text-tenant-solid-2-foreground hover:bg-tenant-solid-2";
  return "bg-transparent border border-tenant-solid-2 text-tenant-solid-2 hover:bg-transparent";
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  capital: "Patrimonio",
  ingreso: "Ingreso",
  gasto: "Gasto",
  costo: "Costo",
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  activo: "bg-green-500/10 text-green-700 dark:text-green-400",
  pasivo: "bg-red-500/10 text-red-700 dark:text-red-400",
  capital: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  ingreso: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  gasto: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  costo: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
};

const ACCOUNT_TYPE_CYCLE = ['activo', 'pasivo', 'capital', 'ingreso', 'gasto', 'costo'];
const BALANCE_TYPE_CYCLE = ['deudor', 'acreedor', 'indiferente'];

function nextInCycle<T>(cycle: T[], current: T): T {
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length] ?? cycle[0];
}

interface FlatNode {
  account: Account;
  level: number;
  hasChildren: boolean;
  descendantCount: number;
  detailCount: number;
}

interface TreeIndex {
  childrenByParent: Map<number | null, Account[]>;
  descendantCount: Map<number, number>;
  detailCount: Map<number, number>;
}

function buildTreeIndex(accounts: Account[]): TreeIndex {
  const childrenByParent = new Map<number | null, Account[]>();
  for (const acc of accounts) {
    const key = (acc.parent_account_id ?? null) as number | null;
    const arr = childrenByParent.get(key);
    if (arr) arr.push(acc);
    else childrenByParent.set(key, [acc]);
  }
  for (const arr of childrenByParent.values()) {
    arr.sort((a, b) => a.account_code.localeCompare(b.account_code));
  }
  const descendantCount = new Map<number, number>();
  const countDesc = (id: number): number => {
    if (descendantCount.has(id)) return descendantCount.get(id)!;
    const kids = childrenByParent.get(id) ?? [];
    let total = kids.length;
    for (const k of kids) total += countDesc(k.id);
    descendantCount.set(id, total);
    return total;
  };
  for (const acc of accounts) countDesc(acc.id);
  const detailCount = new Map<number, number>();
  const countDetail = (id: number): number => {
    const cached = detailCount.get(id);
    if (cached !== undefined) return cached;
    let total = 0;
    for (const k of childrenByParent.get(id) ?? []) {
      if (k.allows_movement === true) total += 1;
      total += countDetail(k.id);
    }
    detailCount.set(id, total);
    return total;
  };
  for (const acc of accounts) countDetail(acc.id);
  return { childrenByParent, descendantCount, detailCount };
}

function flattenVisible(index: TreeIndex, expanded: Set<number>): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (parentId: number | null, level: number) => {
    const kids = index.childrenByParent.get(parentId) ?? [];
    for (const account of kids) {
      const hasChildren = (index.childrenByParent.get(account.id)?.length ?? 0) > 0;
      out.push({
        account,
        level,
        hasChildren,
        descendantCount: index.descendantCount.get(account.id) ?? 0,
        detailCount: index.detailCount.get(account.id) ?? 0,
      });
      if (hasChildren && expanded.has(account.id)) walk(account.id, level + 1);
    }
  };
  walk(null, 0);
  return out;
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------
interface AccountRowProps {
  node: FlatNode;
  isExpanded: boolean;
  onToggleExpand: (id: number) => void;
  onEdit: (account: Account) => void;
  onDelete: AccountTreeViewProps['onDelete'];
  onQuickCreate?: AccountTreeViewProps['onQuickCreate'];
  onInlineUpdate?: AccountTreeViewProps['onInlineUpdate'];
  index: TreeIndex;
}

function AccountRowBase({
  node,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onQuickCreate,
  onInlineUpdate,
  index,
}: AccountRowProps) {
  const { account, level, hasChildren, descendantCount, detailCount } = node;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0, currentName: "" });
  const [deleteSuccess, setDeleteSuccess] = useState<{ count: number } | null>(null);
  const [savingField, setSavingField] = useState<InlineField | null>(null);
  const [pulseField, setPulseField] = useState<InlineField | null>(null);

  const paddingLeft = `${level * 1.25}rem`;

  const collectDescendantIds = useCallback((id: number): number[] => {
    const out: number[] = [];
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const kids = index.childrenByParent.get(cur) ?? [];
      for (const k of kids) {
        out.push(k.id);
        stack.push(k.id);
      }
    }
    return out;
  }, [index]);

  const handleDeleteClick = () => {
    setDeleteError(null);
    setDeleteSuccess(null);
    setDeleteProgress({ current: 0, total: 0, currentName: "" });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(null);
    const descendantIds = collectDescendantIds(account.id);
    const result = await onDelete(account, descendantIds, (current, total, currentName) => {
      setDeleteProgress({ current, total, currentName });
    });
    setIsDeleting(false);
    if (!result.canDelete) setDeleteError(result.message || "No se puede eliminar la cuenta");
    else setDeleteSuccess({ count: result.deletedCount ?? 1 });
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (isDeleting) return;
    setDeleteDialogOpen(open);
    if (!open) {
      setDeleteError(null);
      setDeleteSuccess(null);
      setDeleteProgress({ current: 0, total: 0, currentName: "" });
    }
  };

  const runInline = useCallback(
    async (field: InlineField, nextValue: string | boolean) => {
      if (!onInlineUpdate || savingField) return;
      setSavingField(field);
      const res = await onInlineUpdate(account.id, field, nextValue);
      setSavingField(null);
      if (res.ok) {
        setPulseField(field);
        setTimeout(() => setPulseField((p) => (p === field ? null : p)), 600);
      }
    },
    [account.id, onInlineUpdate, savingField]
  );

  const cycleAccountType = () => runInline('account_type', nextInCycle(ACCOUNT_TYPE_CYCLE, account.account_type));
  const cycleBalanceType = () => runInline('balance_type', nextInCycle(BALANCE_TYPE_CYCLE, account.balance_type ?? 'deudor'));
  const toggleMovement = () => runInline('allows_movement', !account.allows_movement);

  const onKey = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const interactive = !!onInlineUpdate;
  const pulseClass = (field: InlineField) =>
    pulseField === field ? 'ring-2 ring-primary/60 ring-offset-1 ring-offset-background' : '';
  const savingClass = (field: InlineField) =>
    savingField === field ? 'opacity-60' : '';

  const canCreateChild = !account.allows_movement;
  const bt = account.balance_type ?? 'deudor';
  const balanceStyles: Record<string, string> = {
    deudor: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    acreedor: "bg-red-500/15 text-red-700 dark:text-red-400",
    indiferente: "bg-muted text-muted-foreground",
  };
  const balanceLabel = bt === 'deudor' ? 'Deudor' : bt === 'acreedor' ? 'Acreedor' : 'Indiferente';
  const balanceLetter = bt === 'deudor' ? 'D' : bt === 'acreedor' ? 'A' : 'I';

  const isGroup = hasChildren;
  const showTypeChip = !isGroup || account.level === 1;
  const groupStyle = isGroup ? groupRowClass(account.level) : "bg-card border-l-transparent hover:bg-[hsl(var(--table-row-hover))]";
  const rowProps = getClickableRowProps(
    () => (isGroup ? onToggleExpand(account.id) : onEdit(account)),
    isGroup
      ? `${isExpanded ? "Colapsar" : "Expandir"} ${account.account_name}`
      : `Editar cuenta ${account.account_code} ${account.account_name}`,
  );
  const { className: clickableClass, ...clickHandlers } = rowProps;
  const detailLabel = detailCount === 1 ? "1 cuenta" : `${detailCount} cuentas`;

  return (
    <>
      <div
        {...clickHandlers}
        className={`${ROW_GRID} items-center gap-2 px-3 py-1.5 min-h-[44px] border-b border-l-4 transition-colors group ${groupStyle} ${clickableClass.replace("hover:bg-muted/50", "")}`}
      >
        <span
          className={`truncate ${isGroup ? `font-semibold ${account.level === 1 ? "text-base" : "text-sm"}` : "font-mono text-sm text-muted-foreground"}`}
        >
          {account.account_code}
        </span>

        <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft }}>
          {isGroup ? (
            <button
              type="button"
              data-row-action
              onClick={() => onToggleExpand(account.id)}
              className="flex items-center justify-center w-6 h-6 shrink-0"
              aria-label={`${isExpanded ? "Colapsar" : "Expandir"} ${account.account_name}`}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
          ) : (
            <span className="flex items-center justify-center w-6 h-6 shrink-0" aria-hidden>
              <Circle className="h-2 w-2 fill-muted-foreground text-muted-foreground" />
            </span>
          )}
          {isGroup && (
            <Badge data-row-action className={`shrink-0 text-[10px] px-1.5 py-0 ${levelBadgeClass(account.level)}`}>
              Nivel {account.level}
            </Badge>
          )}
          <span className={`truncate ${isGroup ? "font-semibold uppercase" : "font-normal"}`}>{account.account_name}</span>
          {isGroup && <span className="text-xs text-muted-foreground shrink-0">{detailLabel}</span>}
          {!account.is_active && <Badge data-row-action variant="secondary" className="text-xs shrink-0">Inactiva</Badge>}
        </div>

        <div className="flex items-center">
          {showTypeChip && (
            <Badge
              variant="secondary"
              data-row-action
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : -1}
              aria-label={`Tipo de cuenta: ${ACCOUNT_TYPE_LABELS[account.account_type]}. Click para cambiar.`}
              title={interactive ? "Click para cambiar tipo" : undefined}
              onClick={interactive ? cycleAccountType : undefined}
              onKeyDown={interactive ? onKey(cycleAccountType) : undefined}
              className={`${ACCOUNT_TYPE_COLORS[account.account_type]} ${interactive ? 'cursor-pointer select-none' : ''} ${pulseClass('account_type')} ${savingClass('account_type')} transition-all`}
            >
              {savingField === 'account_type' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {ACCOUNT_TYPE_LABELS[account.account_type]}
            </Badge>
          )}
        </div>

        <div className="hidden md:flex items-center justify-center">
          {!isGroup && (
            <span
              data-row-action
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : -1}
              aria-label={`Tipo de saldo: ${balanceLabel}. Click para cambiar.`}
              title={interactive ? `${balanceLabel} — click para cambiar` : balanceLabel}
              onClick={interactive ? cycleBalanceType : undefined}
              onKeyDown={interactive ? onKey(cycleBalanceType) : undefined}
              className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold ${balanceStyles[bt]} ${interactive ? 'cursor-pointer select-none' : ''} ${pulseClass('balance_type')} ${savingClass('balance_type')} transition-all`}
            >
              {savingField === 'balance_type' ? <Loader2 className="h-3 w-3 animate-spin" /> : balanceLetter}
            </span>
          )}
        </div>

        <div className="hidden md:flex items-center">
          {!isGroup && (
            <Badge
              variant={account.allows_movement ? "outline" : "secondary"}
              data-row-action
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : -1}
              aria-label={`Permite movimiento: ${account.allows_movement ? 'sí' : 'no'}. Click para alternar.`}
              title={interactive ? "Click para alternar movimiento" : undefined}
              onClick={interactive ? toggleMovement : undefined}
              onKeyDown={interactive ? onKey(toggleMovement) : undefined}
              className={`text-xs ${interactive ? 'cursor-pointer select-none' : ''} ${account.allows_movement ? '' : 'opacity-60'} ${pulseClass('allows_movement')} ${savingClass('allows_movement')} transition-all`}
            >
              {savingField === 'allows_movement' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {account.allows_movement ? 'Movimiento' : 'Sin mov.'}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-end gap-0.5">
          {onQuickCreate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-row-action
                  className={`h-8 w-8 text-primary hover:text-primary ${isGroup ? "" : HOVER_REVEAL}`}
                  aria-label="Crear cuenta relacionada"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onQuickCreate(account, 'sibling')}>
                  <Users className="h-4 w-4 mr-2" />
                  Crear Cuenta Hermana
                </DropdownMenuItem>
                {canCreateChild && (
                  <DropdownMenuItem onClick={() => onQuickCreate(account, 'child')}>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Crear Cuenta Hija
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon"
            data-row-action
            onClick={() => onEdit(account)}
            className="h-8 w-8"
            aria-label={`Editar cuenta ${account.account_code} ${account.account_name}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            data-row-action
            onClick={handleDeleteClick}
            className={`h-8 w-8 text-destructive hover:text-destructive ${isGroup ? HOVER_REVEAL : ""}`}
            aria-label="Eliminar cuenta"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteSuccess ? "Eliminación completada" : "¿Eliminar cuenta?"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {deleteSuccess ? (
                  <span className="flex items-center gap-2 text-foreground">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Se {deleteSuccess.count === 1 ? "eliminó" : "eliminaron"}{" "}
                    <strong>{deleteSuccess.count}</strong> cuenta{deleteSuccess.count === 1 ? "" : "s"} correctamente.
                  </span>
                ) : descendantCount > 0 ? (
                  <>
                    Esta acción eliminará la cuenta <strong>{account.account_code} - {account.account_name}</strong> y{" "}
                    <strong>{descendantCount} cuenta(s) dependiente(s)</strong>. Esta acción no se puede deshacer.
                  </>
                ) : (
                  <>
                    Esta acción eliminará la cuenta <strong>{account.account_code} - {account.account_name}</strong>.
                    Esta acción no se puede deshacer.
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {isDeleting && deleteProgress.total > 0 && (
            <div className="space-y-2 rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Eliminando cuentas...
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {deleteProgress.current} / {deleteProgress.total}
                </span>
              </div>
              <Progress value={(deleteProgress.current / deleteProgress.total) * 100} />
              {deleteProgress.currentName && (
                <p className="text-xs text-muted-foreground truncate">{deleteProgress.currentName}</p>
              )}
            </div>
          )}

          {deleteError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{deleteError}</div>
          )}
          <AlertDialogFooter>
            {deleteSuccess ? (
              <AlertDialogAction onClick={() => handleDialogOpenChange(false)}>Cerrar</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmDelete();
                  }}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Eliminando..." : "Eliminar"}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const AccountRow = memo(AccountRowBase, (prev, next) =>
  prev.node.account === next.node.account &&
  prev.node.level === next.node.level &&
  prev.node.hasChildren === next.node.hasChildren &&
  prev.node.descendantCount === next.node.descendantCount &&
  prev.node.detailCount === next.node.detailCount &&
  prev.isExpanded === next.isExpanded &&
  prev.onToggleExpand === next.onToggleExpand &&
  prev.onEdit === next.onEdit &&
  prev.onDelete === next.onDelete &&
  prev.onQuickCreate === next.onQuickCreate &&
  prev.onInlineUpdate === next.onInlineUpdate &&
  prev.index === next.index
);

// ---------------------------------------------------------------------------
// Scroll container (único scroll interno; alto independiente de las filas)
// ---------------------------------------------------------------------------
const ROW_HEIGHT = 44;
const VIRTUALIZATION_THRESHOLD = 80;

export function AccountTreeView({
  accounts,
  onEdit,
  onDelete,
  onQuickCreate,
  onInlineUpdate,
  levelLimit,
  autoExpandAll,
}: AccountTreeViewProps) {
  const index = useMemo(() => buildTreeIndex(accounts), [accounts]);

  const derivedExpanded = useMemo(
    () => new Set(groupsToExpand(accounts, autoExpandAll ? null : levelLimit)),
    [accounts, levelLimit, autoExpandAll],
  );

  // Expansiones manuales: se reinician al cambiar el nivel o los filtros.
  const [expanded, setExpanded] = useState<Set<number> | null>(null);
  useEffect(() => {
    setExpanded(null);
  }, [levelLimit, autoExpandAll]);

  const expandedSet = expanded ?? derivedExpanded;

  const toggleExpand = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev ?? derivedExpanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [derivedExpanded]);

  const flat = useMemo(() => flattenVisible(index, expandedSet), [index, expandedSet]);
  const virtualize = flat.length >= VIRTUALIZATION_THRESHOLD;

  const parentRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: virtualize ? flat.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (i) => flat[i].account.id,
  });

  const renderRow = (node: FlatNode) => (
    <AccountRow
      node={node}
      isExpanded={expandedSet.has(node.account.id)}
      onToggleExpand={toggleExpand}
      onEdit={onEdit}
      onDelete={onDelete}
      onQuickCreate={onQuickCreate}
      onInlineUpdate={onInlineUpdate}
      index={index}
    />
  );

  return (
    <div ref={parentRef} className="h-full overflow-y-auto">
      <div
        className={`${ROW_GRID} sticky top-0 z-10 gap-2 px-3 py-2 border-b border-l-4 border-l-transparent bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground`}
      >
        <span>Código</span>
        <span>Nombre</span>
        <span>Tipo</span>
        <span className="hidden md:block text-center">Saldo</span>
        <span className="hidden md:block">Movimiento</span>
        <span className="text-right">Acciones</span>
      </div>
      {virtualize ? (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(flat[virtualRow.index])}
            </div>
          ))}
        </div>
      ) : (
        <div>
          {flat.map((node) => (
            <div key={node.account.id}>{renderRow(node)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

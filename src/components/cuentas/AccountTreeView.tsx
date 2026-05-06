import { useState } from "react";
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

type Account = Database['public']['Tables']['tab_accounts']['Row'];

interface AccountTreeViewProps {
  accounts: Account[];
  onEdit: (account: Account) => void;
  onDelete: (
    account: Account,
    childrenIds: number[],
    onProgress?: (current: number, total: number, currentName: string) => void
  ) => Promise<{ canDelete: boolean; message?: string; deletedCount?: number }>;
  onQuickCreate?: (referenceAccount: Account, createType: 'sibling' | 'child') => void;
}

interface TreeNodeProps {
  account: Account;
  children: Account[];
  onEdit: (account: Account) => void;
  onDelete: (
    account: Account,
    childrenIds: number[],
    onProgress?: (current: number, total: number, currentName: string) => void
  ) => Promise<{ canDelete: boolean; message?: string; deletedCount?: number }>;
  onQuickCreate?: (referenceAccount: Account, createType: 'sibling' | 'child') => void;
  level: number;
  allAccounts: Account[];
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  capital: "Capital",
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

function TreeNode({ account, children, onEdit, onDelete, onQuickCreate, level, allAccounts }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 4);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0, currentName: "" });
  const [deleteSuccess, setDeleteSuccess] = useState<{ count: number } | null>(null);
  const hasChildren = children.length > 0;
  const paddingLeft = `${level * 1.5}rem`;

  // Get all descendant IDs recursively
  const getAllDescendantIds = (parentId: number): number[] => {
    const directChildren = allAccounts.filter(acc => acc.parent_account_id === parentId);
    let ids: number[] = [];
    for (const child of directChildren) {
      ids.push(child.id);
      ids = ids.concat(getAllDescendantIds(child.id));
    }
    return ids;
  };

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

    const descendantIds = getAllDescendantIds(account.id);
    const result = await onDelete(account, descendantIds, (current, total, currentName) => {
      setDeleteProgress({ current, total, currentName });
    });

    setIsDeleting(false);

    if (!result.canDelete) {
      setDeleteError(result.message || "No se puede eliminar la cuenta");
    } else {
      setDeleteSuccess({ count: result.deletedCount ?? 1 });
    }
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

  const descendantCount = getAllDescendantIds(account.id).length;
  const canCreateChild = !account.allows_movement;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 border-l-4 border-l-transparent hover:bg-[hsl(var(--table-row-hover))] hover:border-l-primary rounded-r-lg transition-colors group"
        style={{ paddingLeft }}
      >
        <button
          onClick={() => hasChildren && setIsExpanded(!isExpanded)}
          className="flex items-center justify-center w-6 h-6"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : (
            <Circle className="h-2 w-2 fill-muted-foreground text-muted-foreground" />
          )}
        </button>

        <div className="flex-1 flex items-center gap-3">
          <span className="font-mono text-sm text-muted-foreground min-w-[120px]">
            {account.account_code}
          </span>
          <span className="font-medium">{account.account_name}</span>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={ACCOUNT_TYPE_COLORS[account.account_type]}>
            {ACCOUNT_TYPE_LABELS[account.account_type]}
          </Badge>

          {account.balance_type === 'deudor' && (
            <span
              title="Deudor"
              className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-700 dark:text-blue-400"
            >
              D
            </span>
          )}
          {account.balance_type === 'acreedor' && (
            <span
              title="Acreedor"
              className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-700 dark:text-red-400"
            >
              A
            </span>
          )}
          {account.balance_type === 'indiferente' && (
            <span
              title="Indiferente"
              className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold bg-muted text-muted-foreground"
            >
              I
            </span>
          )}

          {account.allows_movement && (
            <Badge variant="outline" className="text-xs">
              Movimiento
            </Badge>
          )}

          {!account.is_active && (
            <Badge variant="secondary" className="text-xs">
              Inactiva
            </Badge>
          )}

          {onQuickCreate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
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
            size="sm"
            onClick={() => onEdit(account)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDeleteClick}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={handleDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteSuccess ? "Eliminación completada" : "¿Eliminar cuenta?"}
            </AlertDialogTitle>
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
                <p className="text-xs text-muted-foreground truncate">
                  {deleteProgress.currentName}
                </p>
              )}
            </div>
          )}

          {deleteError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {deleteError}
            </div>
          )}
          <AlertDialogFooter>
            {deleteSuccess ? (
              <AlertDialogAction onClick={() => handleDialogOpenChange(false)}>
                Cerrar
              </AlertDialogAction>
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

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              account={child}
              children={allAccounts.filter(acc => acc.parent_account_id === child.id)}
              onEdit={onEdit}
              onDelete={onDelete}
              onQuickCreate={onQuickCreate}
              level={level + 1}
              allAccounts={allAccounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AccountTreeView({ accounts, onEdit, onDelete, onQuickCreate }: AccountTreeViewProps) {
  const buildTree = (parentId: number | null = null): Account[] => {
    return accounts
      .filter((account) => account.parent_account_id === parentId)
      .sort((a, b) => a.account_code.localeCompare(b.account_code));
  };

  const renderTree = (parentId: number | null, level: number = 0): JSX.Element[] => {
    const accountsAtLevel = buildTree(parentId);
    
    return accountsAtLevel.map((account) => (
      <TreeNode
        key={account.id}
        account={account}
        children={buildTree(account.id)}
        onEdit={onEdit}
        onDelete={onDelete}
        onQuickCreate={onQuickCreate}
        level={level}
        allAccounts={accounts}
      />
    ));
  };

  return (
    <div className="space-y-1">
      {renderTree(null, 0)}
    </div>
  );
}

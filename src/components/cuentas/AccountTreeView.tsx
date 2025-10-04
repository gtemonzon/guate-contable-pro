import { useState } from "react";
import { ChevronRight, ChevronDown, Edit, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Database } from "@/integrations/supabase/types";

type Account = Database['public']['Tables']['tab_accounts']['Row'];

interface AccountTreeViewProps {
  accounts: Account[];
  onEdit: (account: Account) => void;
}

interface TreeNodeProps {
  account: Account;
  children: Account[];
  onEdit: (account: Account) => void;
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

function TreeNode({ account, children, onEdit, level, allAccounts }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 4);
  const hasChildren = children.length > 0;
  const paddingLeft = `${level * 1.5}rem`;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-accent/50 rounded-lg transition-colors group"
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
          
          {account.is_detail_account && (
            <Badge variant="outline" className="text-xs">
              Detalle
            </Badge>
          )}

          {!account.is_active && (
            <Badge variant="secondary" className="text-xs">
              Inactiva
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(account)}
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              account={child}
              children={allAccounts.filter(acc => acc.parent_account_id === child.id)}
              onEdit={onEdit}
              level={level + 1}
              allAccounts={allAccounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AccountTreeView({ accounts, onEdit }: AccountTreeViewProps) {
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

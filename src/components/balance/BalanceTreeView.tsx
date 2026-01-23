import { useState } from "react";
import { ChevronRight, ChevronDown, Circle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

interface Account {
  id: number;
  account_code: string;
  account_name: string;
  balance_type: string;
  level: number;
  previous_balance: number;
  debit: number;
  credit: number;
  balance: number;
  parent_account_id: number | null;
}

interface BalanceTreeViewProps {
  accounts: Account[];
  onViewDetails?: (accountId: number) => void;
}

interface TreeNodeProps {
  account: Account;
  children: Account[];
  level: number;
  allAccounts: Account[];
  onViewDetails?: (accountId: number) => void;
}

function TreeNode({ account, children, level, allAccounts, onViewDetails }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 3);
  const hasChildren = children.length > 0;
  const paddingLeft = `${level * 1.5}rem`;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 border-l-4 border-l-transparent hover:bg-[hsl(var(--table-row-hover))] hover:border-l-primary rounded-r-lg transition-colors border-b"
        style={{ paddingLeft }}
      >
        <button
          onClick={() => hasChildren && setIsExpanded(!isExpanded)}
          className="flex items-center justify-center w-6 h-6 shrink-0"
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

        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="w-24 shrink-0">
            <span className="font-mono text-sm text-muted-foreground">
              {account.account_code}
            </span>
          </div>
          
          <div className="flex-1 min-w-0">
            <span className={`font-medium truncate block ${hasChildren ? 'font-semibold' : ''}`}>
              {account.account_name}
            </span>
          </div>

          <div className="w-28 shrink-0 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''} ${account.previous_balance < 0 ? 'text-red-600' : ''}`}>
              {account.previous_balance !== 0 ? formatCurrency(Math.abs(account.previous_balance)) : "-"}
            </span>
          </div>

          <div className="w-28 shrink-0 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.debit > 0 ? formatCurrency(account.debit) : "-"}
            </span>
          </div>

          <div className="w-28 shrink-0 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.credit > 0 ? formatCurrency(account.credit) : "-"}
            </span>
          </div>

          <div className="w-32 shrink-0 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''} ${account.balance < 0 ? 'text-red-600' : ''}`}>
              {account.balance !== 0 ? formatCurrency(Math.abs(account.balance)) : "-"}
            </span>
          </div>

          <div className="w-10 shrink-0 flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onViewDetails?.(account.id)}
              title="Ver detalle en Mayor General"
              className="h-8 w-8"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              account={child}
              children={allAccounts.filter(acc => acc.parent_account_id === child.id)}
              level={level + 1}
              allAccounts={allAccounts}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BalanceTreeView({ accounts, onViewDetails }: BalanceTreeViewProps) {
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
        level={level}
        allAccounts={accounts}
        onViewDetails={onViewDetails}
      />
    ));
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px] space-y-0">
        {/* Header */}
        <div className="flex items-center gap-2 py-3 px-3 bg-muted/50 font-semibold text-sm border-b-2 sticky top-0">
          <div className="w-6 shrink-0" /> {/* Spacer for expand icon */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div className="w-24 shrink-0 pl-2">Código</div>
            <div className="flex-1 min-w-0">Nombre de Cuenta</div>
            <div className="w-28 shrink-0 text-right">Saldo Ant.</div>
            <div className="w-28 shrink-0 text-right">Debe</div>
            <div className="w-28 shrink-0 text-right">Haber</div>
            <div className="w-32 shrink-0 text-right">Saldo</div>
            <div className="w-10 shrink-0 text-center">Acc.</div>
          </div>
        </div>
        
        {/* Tree */}
        {renderTree(null, 0)}
      </div>
    </div>
  );
}

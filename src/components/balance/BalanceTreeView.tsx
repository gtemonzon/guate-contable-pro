import { useState } from "react";
import { ChevronRight, ChevronDown, Circle } from "lucide-react";

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
}

interface TreeNodeProps {
  account: Account;
  children: Account[];
  level: number;
  allAccounts: Account[];
}

function TreeNode({ account, children, level, allAccounts }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 3);
  const hasChildren = children.length > 0;
  const paddingLeft = `${level * 1.5}rem`;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-accent/50 rounded-lg transition-colors border-b"
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

        <div className="flex-1 grid grid-cols-11 gap-4 items-center">
          <div className="col-span-2">
            <span className="font-mono text-sm text-muted-foreground">
              {account.account_code}
            </span>
          </div>
          
          <div className="col-span-4">
            <span className={`font-medium ${hasChildren ? 'font-semibold' : ''}`}>
              {account.account_name}
            </span>
          </div>

          <div className="col-span-1 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.previous_balance !== 0 ? `Q ${Math.abs(account.previous_balance).toFixed(2)}` : "-"}
            </span>
          </div>

          <div className="col-span-1 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.debit > 0 ? `Q ${account.debit.toFixed(2)}` : "-"}
            </span>
          </div>

          <div className="col-span-1 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.credit > 0 ? `Q ${account.credit.toFixed(2)}` : "-"}
            </span>
          </div>

          <div className="col-span-2 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.balance !== 0 ? `Q ${Math.abs(account.balance).toFixed(2)}` : "-"}
            </span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BalanceTreeView({ accounts }: BalanceTreeViewProps) {
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
      />
    ));
  };

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="grid grid-cols-11 gap-4 py-3 px-3 bg-muted/50 font-semibold text-sm border-b-2 sticky top-0">
        <div className="col-span-2 pl-8">Código</div>
        <div className="col-span-4">Nombre de Cuenta</div>
        <div className="col-span-1 text-right">Saldo Ant.</div>
        <div className="col-span-1 text-right">Debe</div>
        <div className="col-span-1 text-right">Haber</div>
        <div className="col-span-2 text-right">Saldo</div>
      </div>
      
      {/* Tree */}
      {renderTree(null, 0)}
    </div>
  );
}

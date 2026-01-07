import { useState } from "react";
import { ChevronRight, ChevronDown, Circle, Eye, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface MonthlyAccount {
  id: number;
  account_code: string;
  account_name: string;
  balance_type: string;
  level: number;
  initial_balance: number;
  debit: number;
  credit: number;
  movement: number;
  final_balance: number;
  parent_account_id: number | null;
}

interface MonthlyBalanceTreeViewProps {
  accounts: MonthlyAccount[];
  onViewDetails?: (accountId: number) => void;
}

interface TreeNodeProps {
  account: MonthlyAccount;
  children: MonthlyAccount[];
  level: number;
  allAccounts: MonthlyAccount[];
  onViewDetails?: (accountId: number) => void;
}

function getMovementStyle(balanceType: string, movement: number) {
  const isDebit = balanceType === "deudor";
  const isNegative = movement < 0;
  
  // Deudora + negativo = rojo (anómalo - reducción de activo/gasto)
  // Deudora + positivo = negro (normal - aumento de activo/gasto)
  // Acreedora + negativo = negro (normal - reducción de pasivo/ingreso)
  // Acreedora + positivo = rojo (anómalo - aumento sin partida doble)
  
  const isAnomalous = (isDebit && isNegative) || (!isDebit && movement > 0);
  
  return {
    color: isAnomalous ? 'text-red-600' : 'text-foreground',
    icon: movement > 0 ? Plus : movement < 0 ? Minus : null,
  };
}

function TreeNode({ account, children, level, allAccounts, onViewDetails }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 3);
  const hasChildren = children.length > 0;
  const paddingLeft = `${level * 1.5}rem`;

  const movementStyle = getMovementStyle(account.balance_type, account.movement);
  const MovementIcon = movementStyle.icon;

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

        <div className="flex-1 grid grid-cols-12 gap-4 items-center">
          {/* Code */}
          <div className="col-span-1">
            <span className="font-mono text-sm text-muted-foreground">
              {account.account_code}
            </span>
          </div>
          
          {/* Name */}
          <div className="col-span-3">
            <span className={`font-medium ${hasChildren ? 'font-semibold' : ''}`}>
              {account.account_name}
            </span>
          </div>

          {/* Initial Balance */}
          <div className="col-span-2 text-right">
            <span className={cn(
              "font-mono text-sm",
              hasChildren && "font-semibold",
              account.initial_balance < 0 && "text-red-600"
            )}>
              {account.initial_balance !== 0 
                ? formatCurrency(Math.abs(account.initial_balance)) 
                : "-"}
            </span>
          </div>

          {/* Debit */}
          <div className="col-span-1 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.debit > 0 ? formatCurrency(account.debit) : "-"}
            </span>
          </div>

          {/* Credit */}
          <div className="col-span-1 text-right">
            <span className={`font-mono text-sm ${hasChildren ? 'font-semibold' : ''}`}>
              {account.credit > 0 ? formatCurrency(account.credit) : "-"}
            </span>
          </div>

          {/* Movement */}
          <div className="col-span-1 text-right">
            <span className={cn(
              "font-mono text-sm inline-flex items-center gap-0.5",
              hasChildren && "font-semibold",
              movementStyle.color
            )}>
              {MovementIcon && account.movement !== 0 && (
                <MovementIcon className="h-3 w-3" />
              )}
              {account.movement !== 0 
                ? formatCurrency(Math.abs(account.movement)) 
                : "-"}
            </span>
          </div>

          {/* Final Balance */}
          <div className="col-span-2 text-right">
            <span className={cn(
              "font-mono text-sm",
              hasChildren && "font-semibold",
              account.final_balance < 0 && "text-red-600"
            )}>
              {account.final_balance !== 0 
                ? formatCurrency(Math.abs(account.final_balance)) 
                : "-"}
            </span>
          </div>

          {/* Actions */}
          <div className="col-span-1 text-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onViewDetails?.(account.id)}
              title="Ver detalle en Mayor General"
              className="h-8 w-8"
            >
              <Eye className="h-4 w-4" />
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

export function MonthlyBalanceTreeView({ accounts, onViewDetails }: MonthlyBalanceTreeViewProps) {
  const buildTree = (parentId: number | null = null): MonthlyAccount[] => {
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
    <div className="space-y-0">
      {/* Header */}
      <div className="grid grid-cols-12 gap-4 py-3 px-3 bg-muted/50 font-semibold text-sm border-b-2 sticky top-0">
        <div className="col-span-1 pl-8">Código</div>
        <div className="col-span-3">Nombre de Cuenta</div>
        <div className="col-span-2 text-right">Saldo Inicial</div>
        <div className="col-span-1 text-right">Debe</div>
        <div className="col-span-1 text-right">Haber</div>
        <div className="col-span-1 text-right">Movimiento</div>
        <div className="col-span-2 text-right">Saldo Final</div>
        <div className="col-span-1 text-center">Acciones</div>
      </div>
      
      {/* Tree */}
      {renderTree(null, 0)}
    </div>
  );
}

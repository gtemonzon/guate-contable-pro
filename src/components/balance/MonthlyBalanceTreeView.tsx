import { useState } from "react";
import { ChevronRight, ChevronDown, Circle, Eye, Plus, Minus, PlusSquare, MinusSquare } from "lucide-react";
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
  monthly_movements?: Record<number, { debit: number; credit: number; net: number }>;
}

interface MonthLabel {
  value: number;
  label: string;
}

interface MonthlyBalanceTreeViewProps {
  accounts: MonthlyAccount[];
  /** Sorted list of selected month numbers (1-12). */
  months?: number[];
  /** Mapping month number -> display label. */
  monthLabels?: MonthLabel[];
  onViewDetails?: (accountId: number) => void;
}

interface TreeNodeProps {
  account: MonthlyAccount;
  children: MonthlyAccount[];
  level: number;
  allAccounts: MonthlyAccount[];
  months: number[];
  showMonthlyDetail: boolean;
  onViewDetails?: (accountId: number) => void;
}

function getMovementStyle(balanceType: string, movement: number) {
  const isDebit = balanceType === "deudor";
  const isNegative = movement < 0;
  const isAnomalous = (isDebit && isNegative) || (!isDebit && movement > 0);
  return {
    color: isAnomalous ? "text-red-600" : "text-foreground",
    icon: movement > 0 ? Plus : movement < 0 ? Minus : null,
  };
}

function TreeNode({
  account,
  children,
  level,
  allAccounts,
  months,
  showMonthlyDetail,
  onViewDetails,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 3);
  const hasChildren = children.length > 0;
  const paddingLeft = `${level * 1.5}rem`;

  const movementStyle = getMovementStyle(account.balance_type, account.movement);
  const MovementIcon = movementStyle.icon;

  // Adjust column widths: when monthly detail is on, the "Movimiento" column
  // becomes a flex container with one cell per month; otherwise it's a single cell.
  const movementColSpan = showMonthlyDetail ? Math.max(1, months.length) : 1;
  // Use a 12 + N grid where N = extra months when expanded
  const gridCols = showMonthlyDetail ? 12 + (months.length - 1) : 12;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 border-l-4 border-l-transparent hover:bg-[hsl(var(--table-row-hover))] hover:border-l-primary rounded-r-lg transition-colors border-b"
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

        <div
          className="flex-1 grid gap-4 items-center"
          style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
        >
          {/* Code */}
          <div className="col-span-1">
            <span className="font-mono text-sm text-muted-foreground">
              {account.account_code}
            </span>
          </div>

          {/* Name */}
          <div className="col-span-3">
            <span className={`font-medium ${hasChildren ? "font-semibold" : ""}`}>
              {account.account_name}
            </span>
          </div>

          {/* Initial Balance */}
          <div className="col-span-2 text-right">
            <span
              className={cn(
                "font-mono text-sm",
                hasChildren && "font-semibold",
                account.initial_balance < 0 && "text-red-600"
              )}
            >
              {account.initial_balance !== 0
                ? formatCurrency(Math.abs(account.initial_balance))
                : "-"}
            </span>
          </div>

          {/* Debit */}
          <div className="col-span-1 text-right">
            <span className={`font-mono text-sm ${hasChildren ? "font-semibold" : ""}`}>
              {account.debit > 0 ? formatCurrency(account.debit) : "-"}
            </span>
          </div>

          {/* Credit */}
          <div className="col-span-1 text-right">
            <span className={`font-mono text-sm ${hasChildren ? "font-semibold" : ""}`}>
              {account.credit > 0 ? formatCurrency(account.credit) : "-"}
            </span>
          </div>

          {/* Movement: aggregated OR one cell per month */}
          {showMonthlyDetail ? (
            <div
              className="text-right grid gap-2"
              style={{
                gridColumn: `span ${movementColSpan} / span ${movementColSpan}`,
                gridTemplateColumns: `repeat(${movementColSpan}, minmax(0, 1fr))`,
              }}
            >
              {months.map((m) => {
                const cell = account.monthly_movements?.[m];
                const net = cell?.net ?? 0;
                const style = getMovementStyle(account.balance_type, net);
                const Icon = style.icon;
                return (
                  <div key={m} className="text-right">
                    <span
                      className={cn(
                        "font-mono text-sm inline-flex items-center gap-0.5",
                        hasChildren && "font-semibold",
                        style.color
                      )}
                    >
                      {Icon && net !== 0 && <Icon className="h-3 w-3" />}
                      {net !== 0 ? formatCurrency(Math.abs(net)) : "-"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="col-span-1 text-right">
              <span
                className={cn(
                  "font-mono text-sm inline-flex items-center gap-0.5",
                  hasChildren && "font-semibold",
                  movementStyle.color
                )}
              >
                {MovementIcon && account.movement !== 0 && (
                  <MovementIcon className="h-3 w-3" />
                )}
                {account.movement !== 0
                  ? formatCurrency(Math.abs(account.movement))
                  : "-"}
              </span>
            </div>
          )}

          {/* Final Balance */}
          <div className="col-span-2 text-right">
            <span
              className={cn(
                "font-mono text-sm",
                hasChildren && "font-semibold",
                account.final_balance < 0 && "text-red-600"
              )}
            >
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
              children={allAccounts.filter((acc) => acc.parent_account_id === child.id)}
              level={level + 1}
              allAccounts={allAccounts}
              months={months}
              showMonthlyDetail={showMonthlyDetail}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MonthlyBalanceTreeView({
  accounts,
  months = [],
  monthLabels = [],
  onViewDetails,
}: MonthlyBalanceTreeViewProps) {
  const [showMonthlyDetail, setShowMonthlyDetail] = useState(false);
  const canExpandMonths = months.length > 1;
  // If only one month is selected, expanding doesn't add value — force collapsed.
  const effectiveExpand = canExpandMonths && showMonthlyDetail;
  const movementColSpan = effectiveExpand ? months.length : 1;
  const gridCols = effectiveExpand ? 12 + (months.length - 1) : 12;

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
        months={months}
        showMonthlyDetail={effectiveExpand}
        onViewDetails={onViewDetails}
      />
    ));
  };

  const labelFor = (m: number) => monthLabels.find((l) => l.value === m)?.label ?? `Mes ${m}`;

  return (
    <div className="space-y-0 overflow-x-auto">
      {/* Header - sticky with background to cover content below */}
      <div
        className="grid gap-4 py-3 px-3 bg-muted font-semibold text-sm border-b-2 sticky top-[120px] z-[5]"
        style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`, paddingLeft: "2rem" }}
      >
        <div className="col-span-1 pl-8">Código</div>
        <div className="col-span-3">Nombre de Cuenta</div>
        <div className="col-span-2 text-right">Saldo Inicial</div>
        <div className="col-span-1 text-right">Debe</div>
        <div className="col-span-1 text-right">Haber</div>

        {/* Movement header with collapse/expand toggle */}
        {effectiveExpand ? (
          <div
            className="grid gap-2"
            style={{
              gridColumn: `span ${movementColSpan} / span ${movementColSpan}`,
              gridTemplateColumns: `repeat(${movementColSpan}, minmax(0, 1fr))`,
            }}
          >
            {months.map((m, idx) => (
              <div
                key={m}
                className="text-right flex items-center justify-end gap-1"
                title={labelFor(m)}
              >
                {idx === 0 && canExpandMonths && (
                  <button
                    type="button"
                    onClick={() => setShowMonthlyDetail(false)}
                    className="text-muted-foreground hover:text-primary"
                    title="Contraer meses"
                  >
                    <MinusSquare className="h-4 w-4" />
                  </button>
                )}
                <span className="truncate">{labelFor(m)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="col-span-1 text-right flex items-center justify-end gap-1">
            {canExpandMonths && (
              <button
                type="button"
                onClick={() => setShowMonthlyDetail(true)}
                className="text-muted-foreground hover:text-primary"
                title="Expandir movimientos por mes"
              >
                <PlusSquare className="h-4 w-4" />
              </button>
            )}
            <span>Movimiento</span>
          </div>
        )}

        <div className="col-span-2 text-right">Saldo Final</div>
        <div className="col-span-1 text-center">Acciones</div>
      </div>

      {/* Tree */}
      {renderTree(null, 0)}
    </div>
  );
}

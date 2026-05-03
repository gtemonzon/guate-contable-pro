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
  months?: number[];
  monthLabels?: MonthLabel[];
  onViewDetails?: (accountId: number) => void;
}

// Fixed pixel widths to guarantee vertical column alignment regardless of row indentation.
const COL_WIDTHS = {
  chevron: 32,
  code: 80,
  name: 280,
  initial: 130,
  debit: 120,
  credit: 120,
  movement: 130, // when collapsed
  monthCell: 130, // per month when expanded
  final: 140,
  actions: 56,
};

function buildGridTemplate(showMonthlyDetail: boolean, monthsLen: number): string {
  const movementCols = showMonthlyDetail
    ? `repeat(${Math.max(1, monthsLen)}, ${COL_WIDTHS.monthCell}px)`
    : `${COL_WIDTHS.movement}px`;
  return [
    `${COL_WIDTHS.chevron}px`,
    `${COL_WIDTHS.code}px`,
    `minmax(${COL_WIDTHS.name}px, 1fr)`,
    `${COL_WIDTHS.initial}px`,
    `${COL_WIDTHS.debit}px`,
    `${COL_WIDTHS.credit}px`,
    movementCols,
    `${COL_WIDTHS.final}px`,
    `${COL_WIDTHS.actions}px`,
  ].join(" ");
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

interface TreeNodeProps {
  account: MonthlyAccount;
  children: MonthlyAccount[];
  level: number;
  allAccounts: MonthlyAccount[];
  months: number[];
  showMonthlyDetail: boolean;
  gridTemplate: string;
  onViewDetails?: (accountId: number) => void;
}

function TreeNode({
  account,
  children,
  level,
  allAccounts,
  months,
  showMonthlyDetail,
  gridTemplate,
  onViewDetails,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(level < 3);
  const hasChildren = children.length > 0;

  const movementStyle = getMovementStyle(account.balance_type, account.movement);
  const MovementIcon = movementStyle.icon;
  const indent = level * 20; // px, applied only to name cell

  return (
    <div>
      <div
        className="grid gap-3 items-center py-2 px-3 border-l-4 border-l-transparent hover:bg-[hsl(var(--table-row-hover))] hover:border-l-primary transition-colors border-b"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {/* Chevron */}
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

        {/* Code */}
        <div className="font-mono text-sm text-muted-foreground truncate">
          {account.account_code}
        </div>

        {/* Name (indented) */}
        <div className="min-w-0" style={{ paddingLeft: indent }}>
          <span className={`font-medium truncate ${hasChildren ? "font-semibold" : ""}`}>
            {account.account_name}
          </span>
        </div>

        {/* Initial Balance */}
        <div className="text-right">
          <span
            className={cn(
              "font-mono text-sm whitespace-nowrap",
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
        <div className="text-right">
          <span className={`font-mono text-sm whitespace-nowrap ${hasChildren ? "font-semibold" : ""}`}>
            {account.debit > 0 ? formatCurrency(account.debit) : "-"}
          </span>
        </div>

        {/* Credit */}
        <div className="text-right">
          <span className={`font-mono text-sm whitespace-nowrap ${hasChildren ? "font-semibold" : ""}`}>
            {account.credit > 0 ? formatCurrency(account.credit) : "-"}
          </span>
        </div>

        {/* Movement: aggregated OR one cell per month — each occupies its own grid column */}
        {showMonthlyDetail ? (
          months.map((m) => {
            const cell = account.monthly_movements?.[m];
            const net = cell?.net ?? 0;
            const style = getMovementStyle(account.balance_type, net);
            const Icon = style.icon;
            return (
              <div key={m} className="text-right">
                <span
                  className={cn(
                    "font-mono text-sm inline-flex items-center gap-0.5 whitespace-nowrap",
                    hasChildren && "font-semibold",
                    style.color
                  )}
                >
                  {Icon && net !== 0 && <Icon className="h-3 w-3" />}
                  {net !== 0 ? formatCurrency(Math.abs(net)) : "-"}
                </span>
              </div>
            );
          })
        ) : (
          <div className="text-right">
            <span
              className={cn(
                "font-mono text-sm inline-flex items-center gap-0.5 whitespace-nowrap",
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
        <div className="text-right">
          <span
            className={cn(
              "font-mono text-sm whitespace-nowrap",
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
        <div className="text-center">
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
              gridTemplate={gridTemplate}
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
  const effectiveExpand = canExpandMonths && showMonthlyDetail;

  const gridTemplate = buildGridTemplate(effectiveExpand, months.length);

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
        gridTemplate={gridTemplate}
        onViewDetails={onViewDetails}
      />
    ));
  };

  const labelFor = (m: number) => monthLabels.find((l) => l.value === m)?.label ?? `Mes ${m}`;

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        {/* Header */}
        <div
          className="grid gap-3 py-3 px-3 bg-muted font-semibold text-sm border-b-2 sticky top-0 z-10"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div /> {/* chevron column */}
          <div>Código</div>
          <div>Nombre de Cuenta</div>
          <div className="text-right">Saldo Inicial</div>
          <div className="text-right">Debe</div>
          <div className="text-right">Haber</div>

          {effectiveExpand ? (
            months.map((m, idx) => (
              <div
                key={m}
                className="text-right flex items-center justify-end gap-1 whitespace-nowrap"
                title={labelFor(m)}
              >
                {idx === 0 && (
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
            ))
          ) : (
            <div className="text-right flex items-center justify-end gap-1 whitespace-nowrap">
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

          <div className="text-right">Saldo Final</div>
          <div className="text-center">Acciones</div>
        </div>

        {/* Tree */}
        {renderTree(null, 0)}
      </div>
    </div>
  );
}

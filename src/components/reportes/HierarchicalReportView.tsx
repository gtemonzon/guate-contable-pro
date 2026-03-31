import { useState } from "react";
import { ChevronRight, ChevronDown, BookOpen } from "lucide-react";
import type { ReportLine } from "./reportTypes";
import CopyAmountButton from "./CopyAmountButton";

interface HierarchicalReportViewProps {
  lines: ReportLine[];
  expanded: Set<number>;
  toggleExpand: (accountId: number) => void;
  onAccountClick?: (line: ReportLine) => void;
}

/**
 * Collapsible hierarchical view for Balance Sheet / Income Statement.
 * - Arrow toggles expand/collapse only.
 * - Single click on label selects the row.
 * - Double click on label opens the ledger panel.
 * - BookOpen icon also opens the ledger panel.
 */
export default function HierarchicalReportView({ lines, expanded, toggleExpand, onAccountClick }: HierarchicalReportViewProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  return (
    <div className="space-y-0 font-mono text-sm">
      {lines.map((line, idx) => {
        const isAccount = line.type === 'account';
        const hasChildren = isAccount && line.hasChildren;
        const isClickable = isAccount && !!line.accountId && !!onAccountClick;
        const isExpanded = hasChildren && line.accountId ? expanded.has(line.accountId) : false;
        const isSelected = isAccount && line.accountId === selectedId;

        return (
          <div
            key={idx}
            className={[
              'grid grid-cols-[1fr_auto] gap-4 py-1.5 items-center group',
              line.isBold ? 'font-bold' : '',
              line.showLine ? 'border-t border-border' : '',
              isSelected ? 'bg-accent/50 rounded' : '',
            ].join(' ')}
            style={{ paddingLeft: isAccount ? `${Math.min(52, (line.level ?? 0) * 16 + 4)}px` : '4px' }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isAccount && (
                <button
                  type="button"
                  className="w-4 h-4 flex items-center justify-center shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (hasChildren && line.accountId) toggleExpand(line.accountId);
                  }}
                  aria-label={hasChildren ? (isExpanded ? 'Colapsar' : 'Expandir') : undefined}
                >
                  {hasChildren ? (
                    isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </button>
              )}
              <span
                className={[
                  'truncate select-none',
                  isClickable ? 'cursor-pointer hover:text-primary' : '',
                  hasChildren ? 'font-semibold' : '',
                  isSelected ? 'text-primary' : '',
                ].join(' ')}
                onClick={() => {
                  if (isAccount && line.accountId) setSelectedId(line.accountId);
                }}
                onDoubleClick={() => {
                  if (isClickable) onAccountClick!(line);
                }}
              >
                {line.label}
              </span>
              {isClickable && (
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccountClick!(line);
                  }}
                  title="Ver Mayor"
                  aria-label="Abrir libro mayor"
                >
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <div className="text-right whitespace-nowrap pr-1 flex items-center justify-end gap-1">
              {line.type !== 'section' ? (
                <>
                  <span>{`Q ${line.amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                  <CopyAmountButton amount={line.amount} />
                </>
              ) : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ReportLine } from "./reportTypes";

interface HierarchicalReportViewProps {
  lines: ReportLine[];
  onAccountClick?: (line: ReportLine) => void;
}

/**
 * Collapsible hierarchical view for Balance Sheet / Income Statement.
 * - Parent accounts show expand/collapse toggles.
 * - Only leaf accounts (no children) are clickable for drill-down.
 * - Level 1 accounts default to expanded.
 */
export default function HierarchicalReportView({ lines, onAccountClick }: HierarchicalReportViewProps) {
  // Default: expand all level-1 accounts (so level 2 children are visible)
  const defaultExpanded = useMemo(() => {
    const set = new Set<number>();
    for (const line of lines) {
      if (line.type === 'account' && line.accountLevel === 1 && line.accountId && line.hasChildren) {
        set.add(line.accountId);
      }
    }
    return set;
  }, [lines]);

  const [expanded, setExpanded] = useState<Set<number>>(defaultExpanded);

  // Reset expanded when lines change (new report generated)
  const [prevLinesRef, setPrevLinesRef] = useState(lines);
  if (lines !== prevLinesRef) {
    setPrevLinesRef(lines);
    const newDefault = new Set<number>();
    for (const line of lines) {
      if (line.type === 'account' && line.accountLevel === 1 && line.accountId && line.hasChildren) {
        newDefault.add(line.accountId);
      }
    }
    setExpanded(newDefault);
  }

  const toggleExpand = (accountId: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }
      return next;
    });
  };

  // Determine visible lines based on expansion state
  const visibleLines = useMemo(() => {
    const result: ReportLine[] = [];
    // Track collapsed ancestors: if any ancestor is collapsed, hide the line
    const ancestorStack: { accountId: number; expanded: boolean }[] = [];

    for (const line of lines) {
      if (line.type !== 'account') {
        // Section/subtotal/total/calculated lines are always visible
        ancestorStack.length = 0; // reset stack at non-account boundaries
        result.push(line);
        continue;
      }

      const level = line.level ?? 0;

      // Pop stack to find our parent level
      while (ancestorStack.length > 0 && ancestorStack.length >= level) {
        ancestorStack.pop();
      }

      // Check if any ancestor is collapsed
      const hidden = ancestorStack.some(a => !a.expanded);
      if (!hidden) {
        result.push(line);
      }

      // Push ourselves onto the stack if we have children
      if (line.hasChildren && line.accountId) {
        ancestorStack.push({
          accountId: line.accountId,
          expanded: expanded.has(line.accountId),
        });
      }
    }

    return result;
  }, [lines, expanded]);

  return (
    <div className="space-y-0 font-mono text-sm">
      {visibleLines.map((line, idx) => {
        const isAccount = line.type === 'account';
        const hasChildren = isAccount && line.hasChildren;
        const isLeaf = isAccount && !line.hasChildren;
        const isClickable = isLeaf && !!line.accountId && !!onAccountClick;
        const isExpanded = hasChildren && line.accountId ? expanded.has(line.accountId) : false;

        return (
          <div
            key={idx}
            className={[
              'grid grid-cols-[1fr_auto] gap-4 py-1.5 items-center',
              line.isBold ? 'font-bold' : '',
              line.showLine ? 'border-t border-border' : '',
              isClickable ? 'cursor-pointer hover:bg-accent/40 transition-colors rounded' : '',
              hasChildren ? 'cursor-pointer' : '',
            ].join(' ')}
            style={{ paddingLeft: isAccount ? `${Math.min(52, (line.level ?? 0) * 16 + 4)}px` : '4px' }}
            onClick={() => {
              if (hasChildren && line.accountId) {
                toggleExpand(line.accountId);
              } else if (isClickable) {
                onAccountClick!(line);
              }
            }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isAccount && (
                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                  {hasChildren ? (
                    isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
              )}
              <span
                className={[
                  'truncate',
                  isClickable ? 'text-primary hover:underline' : '',
                  hasChildren ? 'font-semibold' : '',
                ].join(' ')}
              >
                {line.label}
              </span>
            </div>
            <div className="text-right whitespace-nowrap pr-1">
              {line.type !== 'section' ? `Q ${line.amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

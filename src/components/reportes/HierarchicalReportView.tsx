import { ChevronRight, ChevronDown } from "lucide-react";
import type { ReportLine } from "./reportTypes";

interface HierarchicalReportViewProps {
  lines: ReportLine[];
  expanded: Set<number>;
  toggleExpand: (accountId: number) => void;
  onAccountClick?: (line: ReportLine) => void;
}

/**
 * Collapsible hierarchical view for Balance Sheet / Income Statement.
 * Receives pre-filtered visible lines and expansion state from parent.
 */
export default function HierarchicalReportView({ lines, expanded, toggleExpand, onAccountClick }: HierarchicalReportViewProps) {
  return (
    <div className="space-y-0 font-mono text-sm">
      {lines.map((line, idx) => {
        const isAccount = line.type === 'account';
        const hasChildren = isAccount && line.hasChildren;
        const isClickable = isAccount && !!line.accountId && !!onAccountClick;
        const isExpanded = hasChildren && line.accountId ? expanded.has(line.accountId) : false;

        return (
          <div
            key={idx}
            className={[
              'grid grid-cols-[1fr_auto] gap-4 py-1.5 items-center',
              line.isBold ? 'font-bold' : '',
              line.showLine ? 'border-t border-border' : '',
              isClickable ? 'cursor-pointer hover:bg-accent/40 transition-colors rounded' : '',
            ].join(' ')}
            style={{ paddingLeft: isAccount ? `${Math.min(52, (line.level ?? 0) * 16 + 4)}px` : '4px' }}
            onClick={() => {
              if (hasChildren && line.accountId) {
                toggleExpand(line.accountId);
              }
              if (isClickable) {
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

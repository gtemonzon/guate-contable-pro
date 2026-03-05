import { ChevronRight, ChevronDown } from "lucide-react";
import type { ReportLine } from "./reportTypes";

interface ColumnarReportViewProps {
  lines: ReportLine[];
  maxLevel?: number;
  expanded: Set<number>;
  toggleExpand: (accountId: number) => void;
  onAccountClick?: (line: ReportLine) => void;
}

/**
 * Displays financial report lines in a columnar layout where each account level
 * occupies its own column, instead of using indentation.
 */
export default function ColumnarReportView({ lines, maxLevel: maxLevelProp, expanded, toggleExpand, onAccountClick }: ColumnarReportViewProps) {
  const accountLines = lines.filter(l => l.type === 'account' && l.accountLevel);
  const computedMax = accountLines.length > 0
    ? Math.max(...accountLines.map(l => l.accountLevel!))
    : 1;
  const maxLevel = Math.min(maxLevelProp ?? computedMax, 6);

  const levelHeaders = Array.from({ length: maxLevel }, (_, i) => `Nivel ${i + 1}`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono border-collapse">
        <thead>
          <tr className="bg-muted/60 text-left">
            {levelHeaders.map((h, i) => (
              <th
                key={i}
                className="px-2 py-2 font-semibold border-b-2 border-border border-r border-r-border/30 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
            <th className="px-3 py-2 font-semibold border-b-2 border-border text-right whitespace-nowrap min-w-[120px]">
              Saldo
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const isSection = line.type === 'section';
            const isSummary = line.type === 'subtotal' || line.type === 'total' || line.type === 'calculated';
            const isAccount = line.type === 'account';
            const acctLevel = line.accountLevel ?? 1;
            const hasChildren = isAccount && line.hasChildren;
            const isClickable = isAccount && !!onAccountClick && !!line.accountId;
            const isExpanded = hasChildren && line.accountId ? expanded.has(line.accountId) : false;

            return (
              <tr
                key={idx}
                className={[
                  line.showLine ? 'border-t-2 border-border' : 'border-b border-border/20',
                  line.isBold ? 'font-bold' : '',
                  isSection ? 'bg-muted/40' : '',
                  isSummary ? 'bg-muted/30' : '',
                  isClickable ? 'cursor-pointer hover:bg-accent/40 transition-colors' : '',
                ].join(' ')}
                onClick={() => {
                  if (hasChildren && line.accountId) toggleExpand(line.accountId);
                  if (isClickable) onAccountClick!(line);
                }}
              >
                {isSection && (
                  <>
                    <td colSpan={maxLevel} className="px-2 py-1.5 font-bold text-foreground">
                      {line.label}
                    </td>
                    <td className="px-3 py-1.5 text-right" />
                  </>
                )}

                {isSummary && (
                  <>
                    <td colSpan={maxLevel} className="px-2 py-1.5 font-bold">
                      {line.label}
                    </td>
                    <td className="px-3 py-1.5 text-right font-bold whitespace-nowrap">
                      Q {line.amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </>
                )}

                {isAccount && (
                  <>
                    {Array.from({ length: maxLevel }, (_, i) => {
                      const col = i + 1;
                      const showHere = col === acctLevel;
                      return (
                        <td
                          key={i}
                          className={[
                            'px-2 py-1 border-r border-r-border/20 truncate max-w-[200px]',
                            showHere ? (line.isBold ? 'font-semibold' : '') : 'text-muted-foreground/30',
                            isClickable && showHere ? 'text-primary hover:underline' : '',
                          ].join(' ')}
                          title={showHere ? line.label : undefined}
                        >
                          {showHere ? (
                            <span className="flex items-center gap-1">
                              {hasChildren && (
                                <span className="w-4 h-4 flex items-center justify-center shrink-0">
                                  {isExpanded
                                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  }
                                </span>
                              )}
                              <span className="truncate">{line.label}</span>
                            </span>
                          ) : ''}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-1 text-right whitespace-nowrap ${line.isBold ? 'font-semibold' : ''}`}>
                      Q {line.amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Converts report lines to columnar Excel data (each level = a column).
 */
export function toColumnarExcelData(lines: ReportLine[], maxLevel?: number): { headers: string[]; data: string[][] } {
  const accountLines = lines.filter(l => l.type === 'account' && l.accountLevel);
  const computedMax = accountLines.length > 0
    ? Math.max(...accountLines.map(l => l.accountLevel!))
    : 1;
  const levels = Math.min(maxLevel ?? computedMax, 6);

  const headers = [
    ...Array.from({ length: levels }, (_, i) => `Nivel ${i + 1}`),
    'Saldo',
  ];

  const data = lines.map((line) => {
    const row: string[] = [];
    const isAccount = line.type === 'account';
    const isSummary = line.type === 'subtotal' || line.type === 'total' || line.type === 'calculated';
    const isSection = line.type === 'section';

    for (let i = 0; i < levels; i++) {
      if (isSection && i === 0) {
        row.push(line.label);
      } else if (isSummary && i === 0) {
        row.push(line.label);
      } else if (isAccount && (line.accountLevel ?? 1) === i + 1) {
        row.push(line.label);
      } else {
        row.push('');
      }
    }

    if (isSection) {
      row.push('');
    } else {
      row.push(line.amount.toFixed(2));
    }

    return row;
  });

  return { headers, data };
}

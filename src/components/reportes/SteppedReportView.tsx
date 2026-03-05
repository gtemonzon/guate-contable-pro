import { useState } from "react";
import { ChevronRight, ChevronDown, BookOpen } from "lucide-react";
import type { ReportLine } from "./reportTypes";

interface SteppedReportViewProps {
  lines: ReportLine[];
  maxLevel?: number;
  expanded: Set<number>;
  toggleExpand: (accountId: number) => void;
  onAccountClick?: (line: ReportLine) => void;
}

const formatAmount = (amount: number) =>
  `Q ${amount.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SteppedReportView({ lines, maxLevel: maxLevelProp, expanded, toggleExpand, onAccountClick }: SteppedReportViewProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const accountLines = lines.filter(l => l.type === 'account' && l.accountLevel);
  const computedMax = accountLines.length > 0
    ? Math.max(...accountLines.map(l => l.accountLevel!))
    : 1;
  const maxLevel = Math.min(maxLevelProp ?? computedMax, 5);

  const levelHeaders = Array.from({ length: maxLevel }, (_, i) => `Nivel ${maxLevel - i}`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-mono border-collapse">
        <thead>
          <tr className="bg-muted/60 text-left">
            <th className="px-3 py-2 font-semibold border-b-2 border-border whitespace-nowrap min-w-[280px]">
              Concepto
            </th>
            {levelHeaders.map((h, i) => (
              <th
                key={i}
                className="px-2 py-2 font-semibold border-b-2 border-border border-l border-l-border/30 text-right whitespace-nowrap min-w-[110px]"
              >
                {h}
              </th>
            ))}
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
            const isSelected = isAccount && line.accountId === selectedId;

            return (
              <tr
                key={idx}
                className={[
                  'group',
                  line.showLine ? 'border-t-2 border-border' : 'border-b border-border/20',
                  line.isBold ? 'font-bold' : '',
                  isSection ? 'bg-muted/40' : '',
                  isSummary ? 'bg-muted/30' : '',
                  isSelected ? 'bg-accent/50' : '',
                ].join(' ')}
              >
                <td
                  className={[
                    'px-3 py-1.5',
                    isSection || isSummary ? 'font-bold' : '',
                  ].join(' ')}
                  style={{
                    paddingLeft: isAccount ? `${Math.min(48, (line.level ?? 1) * 12 + 12)}px` : undefined,
                  }}
                >
                  <span className="flex items-center gap-1">
                    {isAccount && hasChildren && (
                      <button
                        type="button"
                        className="w-4 h-4 flex items-center justify-center shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (line.accountId) toggleExpand(line.accountId);
                        }}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </button>
                    )}
                    {isAccount && !hasChildren && (
                      <span className="w-4 h-4 flex items-center justify-center shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                      </span>
                    )}
                    <span
                      className={[
                        'truncate select-none',
                        isClickable ? 'cursor-pointer hover:text-primary' : '',
                        isSelected ? 'text-primary' : '',
                      ].join(' ')}
                      onClick={() => { if (isAccount && line.accountId) setSelectedId(line.accountId); }}
                      onDoubleClick={() => { if (isClickable) onAccountClick!(line); }}
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
                      >
                        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </span>
                </td>

                {Array.from({ length: maxLevel }, (_, i) => {
                  const colLevel = maxLevel - i;

                  let cellValue = '';
                  if (isAccount && acctLevel === colLevel) {
                    cellValue = formatAmount(line.amount);
                  } else if (isSummary && colLevel === 1) {
                    cellValue = formatAmount(line.amount);
                  }

                  return (
                    <td
                      key={i}
                      className={`px-2 py-1.5 text-right border-l border-l-border/20 whitespace-nowrap ${
                        line.isBold && cellValue ? 'font-bold' : ''
                      }`}
                    >
                      {cellValue}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Converts report lines to stepped Excel data.
 */
export function toSteppedExcelData(lines: ReportLine[], maxLevel?: number): { headers: string[]; data: string[][] } {
  const accountLines = lines.filter(l => l.type === 'account' && l.accountLevel);
  const computedMax = accountLines.length > 0
    ? Math.max(...accountLines.map(l => l.accountLevel!))
    : 1;
  const levels = Math.min(maxLevel ?? computedMax, 5);

  const headers = [
    'Concepto',
    ...Array.from({ length: levels }, (_, i) => `Nivel ${levels - i}`),
  ];

  const data = lines.map((line) => {
    const row: string[] = [];
    const isAccount = line.type === 'account';
    const isSummary = line.type === 'subtotal' || line.type === 'total' || line.type === 'calculated';
    const acctLevel = line.accountLevel ?? 1;

    row.push(isAccount ? `  ${line.label}` : line.label);

    for (let i = 0; i < levels; i++) {
      const colLevel = levels - i;
      if (isAccount && acctLevel === colLevel) {
        row.push(line.amount.toFixed(2));
      } else if (isSummary && colLevel === 1) {
        row.push(line.amount.toFixed(2));
      } else {
        row.push('');
      }
    }

    return row;
  });

  return { headers, data };
}

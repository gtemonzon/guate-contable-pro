import { formatCurrency } from "@/lib/utils";

interface ReportLine {
  type: 'section' | 'account' | 'subtotal' | 'total' | 'calculated';
  label: string;
  amount: number;
  level?: number;
  accountLevel?: number;
  isBold?: boolean;
  showLine?: boolean;
}

interface ColumnarReportViewProps {
  lines: ReportLine[];
  maxLevel?: number;
}

/**
 * Displays financial report lines in a columnar layout where each account level
 * occupies its own column, instead of using indentation.
 */
export default function ColumnarReportView({ lines, maxLevel: maxLevelProp }: ColumnarReportViewProps) {
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

            return (
              <tr
                key={idx}
                className={[
                  line.showLine ? 'border-t-2 border-border' : 'border-b border-border/20',
                  line.isBold ? 'font-bold' : '',
                  isSection ? 'bg-muted/40' : '',
                  isSummary ? 'bg-muted/30' : '',
                ].join(' ')}
              >
                {isSection && (
                  <>
                    <td
                      colSpan={maxLevel}
                      className="px-2 py-1.5 font-bold text-foreground"
                    >
                      {line.label}
                    </td>
                    <td className="px-3 py-1.5 text-right" />
                  </>
                )}

                {isSummary && (
                  <>
                    <td
                      colSpan={maxLevel}
                      className="px-2 py-1.5 font-bold"
                    >
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
                      // Show account name in its matching level column
                      const showHere = col === acctLevel;
                      // For parent accounts (level < maxLevel with children), show in their column
                      return (
                        <td
                          key={i}
                          className={[
                            'px-2 py-1 border-r border-r-border/20 truncate max-w-[200px]',
                            showHere ? (line.isBold ? 'font-semibold' : '') : 'text-muted-foreground/30',
                          ].join(' ')}
                          title={showHere ? line.label : undefined}
                        >
                          {showHere ? line.label : ''}
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

    // Balance column
    if (isSection) {
      row.push('');
    } else {
      row.push(line.amount.toFixed(2));
    }

    return row;
  });

  return { headers, data };
}

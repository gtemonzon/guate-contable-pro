import { useState, useMemo } from "react";
import type { ReportLine } from "./reportTypes";

/**
 * Shared hook for managing tree expand/collapse state across all report layouts.
 * Returns the expanded set, a toggle function, and the filtered visible lines.
 */
export function useReportTreeState(lines: ReportLine[]) {
  // Default: expand all level-1 accounts
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
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  // Determine visible lines based on expansion state
  const visibleLines = useMemo(() => {
    const result: ReportLine[] = [];
    const ancestorStack: { accountId: number; expanded: boolean }[] = [];

    for (const line of lines) {
      if (line.type !== 'account') {
        ancestorStack.length = 0;
        result.push(line);
        continue;
      }

      const level = line.level ?? 0;
      while (ancestorStack.length > 0 && ancestorStack.length >= level) {
        ancestorStack.pop();
      }

      const hidden = ancestorStack.some(a => !a.expanded);
      if (!hidden) result.push(line);

      if (line.hasChildren && line.accountId) {
        ancestorStack.push({
          accountId: line.accountId,
          expanded: expanded.has(line.accountId),
        });
      }
    }

    return result;
  }, [lines, expanded]);

  return { expanded, toggleExpand, visibleLines };
}

import type { ReportLine } from "./reportTypes";

/**
 * Given a clicked account ID and the flat report lines array,
 * returns the account ID itself plus all its descendant account IDs.
 * For leaf accounts, returns just [accountId].
 */
export function collectDescendantIds(accountId: number, lines: ReportLine[]): number[] {
  const ids: number[] = [accountId];
  let collecting = false;
  let parentLevel: number | undefined;

  for (const line of lines) {
    if (line.type !== 'account') continue;

    if (line.accountId === accountId) {
      collecting = true;
      parentLevel = line.accountLevel ?? line.level;
      continue;
    }

    if (collecting) {
      const level = line.accountLevel ?? line.level ?? 0;
      if (parentLevel !== undefined && level > parentLevel) {
        if (line.accountId) ids.push(line.accountId);
      } else {
        break; // exited the subtree
      }
    }
  }

  return ids;
}

/**
 * Variation-specific version that works with VariationLine shape.
 */
export function collectVariationDescendantIds(
  accountId: number,
  lines: { id: number; level: number }[]
): number[] {
  const ids: number[] = [accountId];
  let collecting = false;
  let parentLevel: number | undefined;

  for (const line of lines) {
    if (line.id === accountId) {
      collecting = true;
      parentLevel = line.level;
      continue;
    }

    if (collecting) {
      if (parentLevel !== undefined && line.level > parentLevel) {
        ids.push(line.id);
      } else {
        break;
      }
    }
  }

  return ids;
}

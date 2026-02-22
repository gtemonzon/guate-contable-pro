import type { DetailLine } from "./useJournalEntryForm";
import type { BankDirection } from "./JournalEntryBankSection";

interface BankLineContext {
  headerDescription?: string;
  beneficiaryName?: string;
  bankReference?: string;
}

/** Build a descriptive label for the auto-managed bank line. */
function buildBankDescription(ctx?: BankLineContext): string {
  const parts: string[] = [];
  if (ctx?.headerDescription) {
    // Take first ~60 chars of description
    const short = ctx.headerDescription.length > 60
      ? ctx.headerDescription.slice(0, 57) + "..."
      : ctx.headerDescription;
    parts.push(short);
  }
  if (ctx?.beneficiaryName) parts.push(ctx.beneficiaryName);
  if (ctx?.bankReference) parts.push(`Ref: ${ctx.bankReference}`);
  return parts.length > 0 ? parts.join(" - ") : "Banco (auto)";
}

/**
 * Enforces the single-bank-line invariant:
 * - If bankAccountId is set, exactly ONE line must be is_bank_line=true with that account.
 * - Adopts existing lines matching the bank GL account instead of creating duplicates.
 * - Merges/removes zero-amount duplicates.
 * - Recalculates the bank line amount to auto-balance the entry.
 *
 * If bankAccountId is null, removes all bank lines.
 */
export function enforceBankLineInvariant(
  lines: DetailLine[],
  bankAccountId: number | null,
  bankDirection: BankDirection,
  context?: BankLineContext,
): DetailLine[] {
  // ── No bank account: strip all bank lines ──
  if (!bankAccountId) {
    const withoutBank = lines.filter(l => !l.is_bank_line);
    if (withoutBank.length >= 2) return withoutBank;
    // ensure at least 2 lines
    return [
      ...withoutBank,
      ...Array.from({ length: 2 - withoutBank.length }, () => ({
        id: crypto.randomUUID(),
        account_id: null,
        description: "",
        cost_center: "",
        debit_amount: 0,
        credit_amount: 0,
      })),
    ];
  }

  // ── Bank account is set ──

  // Separate existing bank-flagged lines and regular lines
  const flaggedBankLines = lines.filter(l => l.is_bank_line);
  const regularLines = lines.filter(l => !l.is_bank_line);

  // Find regular (non-flagged) lines that happen to use the bank GL account
  const matchingRegular = regularLines.filter(l => l.account_id === bankAccountId);
  const nonMatchingRegular = regularLines.filter(l => l.account_id !== bankAccountId);

  // Build candidate pool: all flagged + matching regular lines
  const candidates = [...flaggedBankLines, ...matchingRegular];

  let primaryBankLine: DetailLine;

  if (candidates.length === 0) {
    // No candidates at all → create a fresh bank line
    primaryBankLine = {
      id: crypto.randomUUID(),
      account_id: bankAccountId,
      description: buildBankDescription(context),
      cost_center: "",
      debit_amount: 0,
      credit_amount: 0,
      is_bank_line: true,
    };
  } else if (candidates.length === 1) {
    // Exactly one candidate → adopt it
    primaryBankLine = {
      ...candidates[0],
      account_id: bankAccountId,
      is_bank_line: true,
    };
    // Update description with context if it was generic or empty
    if (!primaryBankLine.description || primaryBankLine.description === "" || primaryBankLine.description === "Banco (auto)") {
      primaryBankLine.description = buildBankDescription(context);
    }
  } else {
    // Multiple candidates → pick the best one, discard/merge others
    // Prefer: (1) non-zero amount, (2) has "Ref:" or meaningful description, (3) already flagged
    const scored = candidates.map(c => {
      let score = 0;
      const amt = (c.debit_amount || 0) + (c.credit_amount || 0);
      if (amt > 0) score += 10;
      if (c.description && /ref:/i.test(c.description)) score += 5;
      if (c.is_bank_line) score += 2;
      return { line: c, score };
    });
    scored.sort((a, b) => b.score - a.score);

    primaryBankLine = {
      ...scored[0].line,
      account_id: bankAccountId,
      is_bank_line: true,
    };
    if (!primaryBankLine.description || primaryBankLine.description === "" || primaryBankLine.description === "Banco (auto)") {
      primaryBankLine.description = buildBankDescription(context);
    }
  }

  // ── Recalculate bank line amount to auto-balance ──
  const otherDebits = nonMatchingRegular.reduce((s, l) => s + (l.debit_amount || 0), 0);
  const otherCredits = nonMatchingRegular.reduce((s, l) => s + (l.credit_amount || 0), 0);
  const diff = Math.round((otherDebits - otherCredits) * 100) / 100;

  let newDebit = 0;
  let newCredit = 0;

  if (bankDirection === "OUT") {
    if (diff > 0) newCredit = diff;
    else if (diff < 0) newDebit = Math.abs(diff);
  } else {
    if (diff < 0) newDebit = Math.abs(diff);
    else if (diff > 0) newCredit = diff;
  }

  primaryBankLine.debit_amount = newDebit;
  primaryBankLine.credit_amount = newCredit;

  // ── Reassemble: regular (non-matching) lines + primary bank line at the end ──
  return [...nonMatchingRegular, primaryBankLine];
}

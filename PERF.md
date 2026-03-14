# Performance: Server-Side Balance Aggregation

## Problem

The original implementation pulled **all raw journal entry detail rows** to the browser and aggregated them in JavaScript. For an enterprise with 50,000 posted lines this meant:

- ~50,000 rows transferred over the network
- Client RAM spike while building balance maps
- Multiple sequential round-trips (accounts fetch → entries fetch → previous entries fetch)
- Supabase's 1,000-row default limit silently truncated results (partially mitigated with `fetchAllRecords` pagination, but still O(n) network traffic)

## Solution

All aggregation now happens inside Postgres via `SECURITY DEFINER` RPC functions. The browser receives only the **final summary rows** (one per account).

### RPC Functions

| Function | Replaces | Returns |
|---|---|---|
| `get_balance_sheet(enterprise_id, as_of_date)` | Balance General client loop | One row per activo/pasivo/capital account |
| `get_pnl(enterprise_id, start, end)` | Estado Resultados client loop | One row per ingreso/gasto/costo account |
| `get_trial_balance(enterprise_id, start, end)` | Balance Saldos client loop | One row per account with opening + period + closing columns |
| `get_ledger_detail(enterprise_id, account_ids[], start, end)` | Libro Mayor multi-fetch loop | Detail lines + opening balance per account |
| `get_account_balances_by_period(enterprise_id, end_date)` | Dashboard KPI hook | Hardened to filter `is_posted = true` and `deleted_at IS NULL` |

### Data Flow (before → after)

```
BEFORE
  Browser → SELECT * FROM tab_journal_entry_details (N rows, paginated)
          → SELECT * FROM tab_journal_entry_details (previous period, paginated)
          → JS aggregation loop
          → render

AFTER
  Browser → RPC get_balance_sheet() (1 call)
          ← M account rows (M << N)
          → render
```

### Security

Every RPC:
- Is `STABLE SECURITY DEFINER` with `SET search_path = public`
- Verifies `tab_user_enterprises` membership OR `is_super_admin()` before returning any data
- Never exposes rows from other enterprises — isolation is enforced at query time, not by RLS bypass

## Expected Scale Benefits

| Scenario | Before | After |
|---|---|---|
| 1,000 journal lines | ~1,000 rows transferred | ~200 account rows |
| 10,000 journal lines | ~10,000 rows (multiple paginated fetches) | ~200 account rows |
| 100,000 journal lines | Would silently miss data without pagination; slow | ~200 account rows, same latency |

Network payload reduction is roughly **N_lines / N_accounts** — typically 50–500×.

## Fiscal Year Closing Architecture

The system now supports proper fiscal year closing with three generated entries:

1. **Closing Entry (CIER-)**: Closes all income and expense accounts to zero, with offset to "Resultado del Período"
2. **Transfer Entry (TRAS-)**: Moves the period result to "Utilidades Acumuladas" (retained earnings) in equity
3. **Opening Entry (APER-)**: Creates opening balances for all balance sheet accounts (Assets, Liabilities, Equity) on Jan 1 of the next year

### Phase 5 (Pending): Report Calculation Update
Reports currently use cumulative historical calculation. Future update will change reports to use:
- Opening Balance = OPENING_BALANCE entry
- + Movements within selected period
This will improve performance for large datasets.

## Future Improvements

1. **Indexes**: Add a composite index on `(enterprise_id, entry_date, is_posted)` on `tab_journal_entries` and `(journal_entry_id, account_id)` on `tab_journal_entry_details` to accelerate the GROUP BY queries.

2. **Materialized snapshots**: If query time becomes a bottleneck at very large scale (>500k lines), add a `account_balance_monthly` snapshot table updated by a trigger on journal entry posting. RPCs can then read snapshots + delta for the current month.

3. **Parallel RPC calls**: Dashboard already fires `get_account_balances_by_period` and `get_period_profit` in parallel via `Promise.all`. Apply the same pattern to report pages.

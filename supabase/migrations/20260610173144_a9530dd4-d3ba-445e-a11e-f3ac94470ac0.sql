CREATE OR REPLACE FUNCTION public.calculate_account_balance_for_overdraft(
  p_account_id bigint,
  p_enterprise_id bigint,
  p_entry_date date,
  p_exclude_entry_id bigint DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Sum movements only within the fiscal year of p_entry_date.
  -- The APER (opening) entry on Jan 1 already carries forward prior-year balances
  -- for asset/liability/equity accounts; income/expense accounts reset at year-end
  -- via CIER (closing) entries.
  SELECT COALESCE(SUM(d.debit_amount - d.credit_amount), 0)::numeric
  FROM tab_journal_entry_details d
  JOIN tab_journal_entries j ON j.id = d.journal_entry_id
  WHERE d.account_id = p_account_id
    AND j.enterprise_id = p_enterprise_id
    AND j.is_posted = true
    AND j.deleted_at IS NULL
    AND j.entry_date >= make_date(EXTRACT(YEAR FROM p_entry_date)::int, 1, 1)
    AND j.entry_date <= make_date(EXTRACT(YEAR FROM p_entry_date)::int, 12, 31)
    AND (p_exclude_entry_id IS NULL OR j.id <> p_exclude_entry_id);
$$;

GRANT EXECUTE ON FUNCTION public.calculate_account_balance_for_overdraft(bigint, bigint, date, bigint) TO authenticated, service_role;

-- Drop the old signature without entry_date to avoid ambiguity
DROP FUNCTION IF EXISTS public.calculate_account_balance_for_overdraft(bigint, bigint, bigint);
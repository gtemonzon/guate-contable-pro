CREATE OR REPLACE FUNCTION public.calculate_account_balance_for_overdraft(
  p_account_id bigint,
  p_enterprise_id bigint,
  p_exclude_entry_id bigint DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(d.debit_amount - d.credit_amount), 0)::numeric
  FROM tab_journal_entry_details d
  JOIN tab_journal_entries j ON j.id = d.journal_entry_id
  WHERE d.account_id = p_account_id
    AND j.enterprise_id = p_enterprise_id
    AND j.is_posted = true
    AND j.deleted_at IS NULL
    AND (p_exclude_entry_id IS NULL OR j.id <> p_exclude_entry_id);
$$;

GRANT EXECUTE ON FUNCTION public.calculate_account_balance_for_overdraft(bigint, bigint, bigint) TO authenticated, service_role;
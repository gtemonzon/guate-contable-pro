CREATE OR REPLACE FUNCTION public.get_account_balances_by_period(p_enterprise_id bigint, p_end_date date)
RETURNS TABLE(account_id bigint, account_code text, account_name text, account_type text, balance_type text, total_debit numeric, total_credit numeric, balance numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH _access AS (
    SELECT 1
    WHERE public.is_super_admin(auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.tab_user_enterprises ue
         WHERE ue.user_id = auth.uid()
           AND ue.enterprise_id = p_enterprise_id
       )
  )
  SELECT
    a.id                                            AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.balance_type,
    COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN d.debit_amount  ELSE 0 END), 0) AS total_debit,
    COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN d.credit_amount ELSE 0 END), 0) AS total_credit,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type IN ('activo', 'gasto')
      THEN COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN d.debit_amount  ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN d.credit_amount ELSE 0 END), 0)
      ELSE COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN d.credit_amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN d.debit_amount  ELSE 0 END), 0)
    END                                             AS balance
  FROM public.tab_accounts a
  LEFT JOIN public.tab_journal_entry_details d
    ON d.account_id = a.id
    AND d.deleted_at IS NULL
  LEFT JOIN public.tab_journal_entries e
    ON e.id = d.journal_entry_id
    AND e.enterprise_id = p_enterprise_id
    AND e.entry_date    <= p_end_date
    AND e.deleted_at    IS NULL
    AND e.is_posted      = true
  WHERE a.enterprise_id = p_enterprise_id
    AND a.is_active     = true
    AND EXISTS (SELECT 1 FROM _access)
  GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.balance_type
$function$;
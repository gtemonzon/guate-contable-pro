CREATE OR REPLACE FUNCTION public.get_period_profit(p_enterprise_id bigint, p_start_date date, p_end_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    SUM(
      CASE a.account_type
        WHEN 'ingreso' THEN d.credit_amount - d.debit_amount
        WHEN 'gasto'   THEN d.debit_amount  - d.credit_amount
        ELSE 0
      END
    ), 0
  )
  FROM public.tab_journal_entry_details d
  JOIN public.tab_journal_entries e
    ON e.id = d.journal_entry_id
    AND e.enterprise_id = p_enterprise_id
    AND e.entry_date   >= p_start_date
    AND e.entry_date   <= p_end_date
    AND e.deleted_at   IS NULL
    AND e.is_posted     = true
    AND e.reversal_entry_id IS NULL
    AND e.reversed_by_entry_id IS NULL
  JOIN public.tab_accounts a
    ON a.id            = d.account_id
    AND a.enterprise_id = p_enterprise_id
    AND a.account_type IN ('ingreso', 'gasto')
  WHERE d.deleted_at IS NULL
$function$;
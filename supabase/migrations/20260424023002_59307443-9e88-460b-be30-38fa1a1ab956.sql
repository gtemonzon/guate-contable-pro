DROP FUNCTION IF EXISTS public.get_ledger_detail(bigint, bigint[], date, date);

CREATE OR REPLACE FUNCTION public.get_ledger_detail(
  p_enterprise_id bigint,
  p_account_ids bigint[],
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  detail_id bigint,
  account_id bigint,
  journal_entry_id bigint,
  entry_date date,
  entry_number text,
  entry_description text,
  line_description text,
  debit_amount numeric,
  credit_amount numeric,
  opening_balance numeric,
  currency_code text,
  exchange_rate numeric,
  original_debit numeric,
  original_credit numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH _access AS (
    SELECT 1
    FROM   public.tab_user_enterprises ue
    WHERE  ue.user_id      = auth.uid()
    AND    ue.enterprise_id = p_enterprise_id
    UNION ALL
    SELECT 1 WHERE public.is_super_admin(auth.uid())
    LIMIT 1
  ),
  _fiscal_floor AS (
    SELECT COALESCE(
      (SELECT MAX(e.entry_date)
       FROM public.tab_journal_entries e
       WHERE e.enterprise_id = p_enterprise_id
         AND e.entry_type = 'apertura'
         AND e.is_posted = true
         AND e.deleted_at IS NULL
         AND e.entry_date <= p_start_date),
      '1900-01-01'::date
    ) AS floor_date
  ),
  _opening AS (
    SELECT d.account_id,
           COALESCE(SUM(d.debit_amount),  0) AS debit,
           COALESCE(SUM(d.credit_amount), 0) AS credit
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id  = p_enterprise_id
    AND    d.account_id     = ANY(p_account_ids)
    AND    e.entry_date    >= (SELECT floor_date FROM _fiscal_floor)
    AND    e.entry_date     < p_start_date
    AND    e.is_posted      = true
    AND    e.deleted_at IS NULL
    AND    d.deleted_at IS NULL
    GROUP  BY d.account_id
  ),
  _movements AS (
    SELECT d.id              AS detail_id,
           d.account_id,
           e.id              AS journal_entry_id,
           e.entry_date,
           e.entry_number,
           e.description     AS entry_description,
           d.description     AS line_description,
           d.debit_amount,
           d.credit_amount,
           d.currency_code,
           d.exchange_rate,
           d.original_debit,
           d.original_credit
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id = p_enterprise_id
    AND    d.account_id    = ANY(p_account_ids)
    AND    e.entry_date BETWEEN p_start_date AND p_end_date
    AND    e.is_posted     = true
    AND    e.deleted_at IS NULL
    AND    d.deleted_at IS NULL
  )
  SELECT m.detail_id,
         m.account_id,
         m.journal_entry_id,
         m.entry_date,
         m.entry_number,
         m.entry_description,
         m.line_description,
         m.debit_amount,
         m.credit_amount,
         COALESCE(o.debit, 0) - COALESCE(o.credit, 0) AS opening_balance,
         m.currency_code,
         m.exchange_rate,
         m.original_debit,
         m.original_credit
  FROM   _movements m
  LEFT JOIN _opening o ON o.account_id = m.account_id
  WHERE  EXISTS (SELECT 1 FROM _access)
  ORDER  BY m.account_id, m.entry_date, m.entry_number, m.detail_id;
$function$;
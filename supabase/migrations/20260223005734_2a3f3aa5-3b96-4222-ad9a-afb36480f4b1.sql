
DROP FUNCTION IF EXISTS public.get_ledger_detail(bigint, bigint[], date, date);

CREATE FUNCTION public.get_ledger_detail(
  p_enterprise_id  bigint,
  p_account_ids    bigint[],
  p_start_date     date,
  p_end_date       date
)
RETURNS TABLE (
  detail_id         bigint,
  account_id        bigint,
  journal_entry_id  bigint,
  entry_date        date,
  entry_number      text,
  entry_description text,
  line_description  text,
  debit_amount      numeric,
  credit_amount     numeric,
  opening_balance   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _access AS (
    SELECT 1
    FROM   public.tab_user_enterprises ue
    WHERE  ue.user_id      = auth.uid()
    AND    ue.enterprise_id = p_enterprise_id
    UNION ALL
    SELECT 1 WHERE public.is_super_admin(auth.uid())
    LIMIT 1
  ),
  _opening AS (
    SELECT d.account_id,
           COALESCE(SUM(d.debit_amount),  0) AS debit,
           COALESCE(SUM(d.credit_amount), 0) AS credit
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id  = p_enterprise_id
    AND    d.account_id     = ANY(p_account_ids)
    AND    e.entry_date     < p_start_date
    AND    e.is_posted       = true
    AND    e.deleted_at     IS NULL
    AND    d.deleted_at     IS NULL
    AND    EXISTS (SELECT 1 FROM _access)
    GROUP BY d.account_id
  ),
  _period AS (
    SELECT
      d.id             AS detail_id,
      d.account_id,
      e.id             AS journal_entry_id,
      e.entry_date,
      e.entry_number,
      e.description    AS entry_description,
      d.description    AS line_description,
      COALESCE(d.debit_amount,  0) AS debit_amount,
      COALESCE(d.credit_amount, 0) AS credit_amount
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id  = p_enterprise_id
    AND    d.account_id     = ANY(p_account_ids)
    AND    e.entry_date    BETWEEN p_start_date AND p_end_date
    AND    e.is_posted       = true
    AND    e.deleted_at     IS NULL
    AND    d.deleted_at     IS NULL
    AND    EXISTS (SELECT 1 FROM _access)
  )
  SELECT
    p.detail_id,
    p.account_id,
    p.journal_entry_id,
    p.entry_date,
    p.entry_number,
    p.entry_description,
    p.line_description,
    p.debit_amount,
    p.credit_amount,
    COALESCE(o.debit, 0) - COALESCE(o.credit, 0) AS opening_balance
  FROM _period p
  LEFT JOIN _opening o USING (account_id)
  ORDER BY p.account_id, p.entry_date, p.entry_number;
$$;


CREATE OR REPLACE FUNCTION public.get_pnl(
  p_enterprise_id bigint,
  p_start_date    date,
  p_end_date      date
)
RETURNS TABLE(
  account_id       bigint,
  account_code     text,
  account_name     text,
  account_type     text,
  level            integer,
  parent_account_id bigint,
  period_debit     numeric,
  period_credit    numeric,
  balance          numeric
)
LANGUAGE sql STABLE SECURITY DEFINER
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
  _accts AS (
    SELECT a.id, a.account_code, a.account_name, a.account_type,
           a.balance_type, a.level, a.parent_account_id
    FROM   public.tab_accounts a
    WHERE  a.enterprise_id = p_enterprise_id
    AND    a.is_active      = true
    AND    a.account_type  IN ('ingreso', 'gasto', 'costo')
    AND    EXISTS (SELECT 1 FROM _access)
  ),
  _movements AS (
    SELECT d.account_id,
           COALESCE(SUM(d.debit_amount),  0) AS debit,
           COALESCE(SUM(d.credit_amount), 0) AS credit
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id = p_enterprise_id
    AND    e.entry_date   >= p_start_date
    AND    e.entry_date   <= p_end_date
    AND    e.is_posted      = true
    AND    e.deleted_at    IS NULL
    AND    d.deleted_at    IS NULL
    AND    e.entry_type   NOT IN ('cierre', 'traslado', 'apertura')
    GROUP BY d.account_id
  )
  SELECT
    a.id             AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.level,
    a.parent_account_id,
    COALESCE(m.debit,  0) AS period_debit,
    COALESCE(m.credit, 0) AS period_credit,
    CASE
      WHEN a.account_type = 'ingreso'             THEN COALESCE(m.credit,0) - COALESCE(m.debit,0)
      WHEN a.account_type IN ('gasto','costo')    THEN COALESCE(m.debit, 0) - COALESCE(m.credit,0)
      ELSE 0
    END              AS balance
  FROM  _accts a
  LEFT  JOIN _movements m ON m.account_id = a.id
  ORDER BY a.account_code
$$;

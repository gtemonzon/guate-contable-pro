
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_enterprise_id bigint,
  p_start_date    date,
  p_end_date      date
)
RETURNS TABLE (
  account_id        bigint,
  account_code      text,
  account_name      text,
  account_type      text,
  balance_type      text,
  level             integer,
  parent_account_id bigint,
  opening_debit     numeric,
  opening_credit    numeric,
  period_debit      numeric,
  period_credit     numeric,
  closing_debit     numeric,
  closing_credit    numeric,
  opening_balance   numeric,
  closing_balance   numeric
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
    AND    EXISTS (SELECT 1 FROM _access)
  ),
  _leaves AS (
    SELECT a.id
    FROM   _accts a
    WHERE  NOT EXISTS (
      SELECT 1 FROM _accts child WHERE child.parent_account_id = a.id
    )
  ),
  _descendants AS (
    SELECT a.id AS ancestor_id, l.id AS leaf_id
    FROM   _accts a
    JOIN   _accts l ON l.account_code LIKE a.account_code || '.%'
    JOIN   _leaves lf ON lf.id = l.id
    UNION ALL
    SELECT l.id, l.id
    FROM   _leaves l
  ),
  _opening AS (
    SELECT d.account_id,
           COALESCE(SUM(d.debit_amount),  0) AS debit,
           COALESCE(SUM(d.credit_amount), 0) AS credit
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id = p_enterprise_id
    AND    e.entry_date    < p_start_date
    AND    e.is_posted      = true
    AND    e.deleted_at    IS NULL
    AND    d.deleted_at    IS NULL
    GROUP BY d.account_id
  ),
  _period AS (
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
    GROUP BY d.account_id
  ),
  _agg AS (
    SELECT
      dm.ancestor_id,
      COALESCE(SUM(o.debit),  0) AS o_debit,
      COALESCE(SUM(o.credit), 0) AS o_credit,
      COALESCE(SUM(p.debit),  0) AS p_debit,
      COALESCE(SUM(p.credit), 0) AS p_credit
    FROM   _descendants dm
    LEFT   JOIN _opening o ON o.account_id = dm.leaf_id
    LEFT   JOIN _period  p ON p.account_id = dm.leaf_id
    GROUP BY dm.ancestor_id
  )
  SELECT
    a.id                                                         AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.balance_type,
    a.level,
    a.parent_account_id,
    COALESCE(ag.o_debit,  0)                                     AS opening_debit,
    COALESCE(ag.o_credit, 0)                                     AS opening_credit,
    COALESCE(ag.p_debit,  0)                                     AS period_debit,
    COALESCE(ag.p_credit, 0)                                     AS period_credit,
    COALESCE(ag.o_debit,  0) + COALESCE(ag.p_debit,  0)         AS closing_debit,
    COALESCE(ag.o_credit, 0) + COALESCE(ag.p_credit, 0)         AS closing_credit,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type IN ('activo', 'gasto')
      THEN COALESCE(ag.o_debit, 0) - COALESCE(ag.o_credit, 0)
      ELSE COALESCE(ag.o_credit, 0) - COALESCE(ag.o_debit,  0)
    END                                                          AS opening_balance,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type IN ('activo', 'gasto')
      THEN (COALESCE(ag.o_debit,0)+COALESCE(ag.p_debit,0))
           - (COALESCE(ag.o_credit,0)+COALESCE(ag.p_credit,0))
      ELSE (COALESCE(ag.o_credit,0)+COALESCE(ag.p_credit,0))
           - (COALESCE(ag.o_debit,0)+COALESCE(ag.p_debit,0))
    END                                                          AS closing_balance
  FROM  _accts a
  LEFT  JOIN _agg ag ON ag.ancestor_id = a.id
  ORDER BY a.account_code
$$;

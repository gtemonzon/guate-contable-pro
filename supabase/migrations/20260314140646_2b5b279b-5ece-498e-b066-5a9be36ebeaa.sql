
-- Phase 5: Update RPCs to use fiscal floor (most recent apertura entry)
-- instead of summing all historical entries from the beginning of time.

-- 1) Update get_trial_balance
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_enterprise_id bigint,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  account_id bigint,
  account_code text,
  account_name text,
  account_type text,
  balance_type text,
  level integer,
  parent_account_id bigint,
  opening_debit numeric,
  opening_credit numeric,
  period_debit numeric,
  period_credit numeric,
  closing_debit numeric,
  closing_credit numeric,
  opening_balance numeric,
  closing_balance numeric
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
    AND    e.entry_date   >= (SELECT floor_date FROM _fiscal_floor)
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

-- 2) Update get_balance_sheet
CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_enterprise_id bigint,
  p_as_of_date date
)
RETURNS TABLE(
  account_id bigint,
  account_code text,
  account_name text,
  account_type text,
  balance_type text,
  level integer,
  parent_account_id bigint,
  total_debit numeric,
  total_credit numeric,
  balance numeric
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
  _fiscal_floor AS (
    SELECT COALESCE(
      (SELECT MAX(e.entry_date)
       FROM public.tab_journal_entries e
       WHERE e.enterprise_id = p_enterprise_id
         AND e.entry_type = 'apertura'
         AND e.is_posted = true
         AND e.deleted_at IS NULL
         AND e.entry_date <= p_as_of_date),
      '1900-01-01'::date
    ) AS floor_date
  ),
  _accts AS (
    SELECT a.id, a.account_code, a.account_name, a.account_type,
           a.balance_type, a.level, a.parent_account_id
    FROM   public.tab_accounts a
    WHERE  a.enterprise_id = p_enterprise_id
    AND    a.is_active      = true
    AND    a.account_type  IN ('activo', 'pasivo', 'capital')
    AND    EXISTS (SELECT 1 FROM _access)
  ),
  _movements AS (
    SELECT d.account_id,
           COALESCE(SUM(d.debit_amount),  0) AS debit,
           COALESCE(SUM(d.credit_amount), 0) AS credit
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id = p_enterprise_id
    AND    e.entry_date   >= (SELECT floor_date FROM _fiscal_floor)
    AND    e.entry_date   <= p_as_of_date
    AND    e.is_posted      = true
    AND    e.deleted_at    IS NULL
    AND    d.deleted_at    IS NULL
    GROUP BY d.account_id
  )
  SELECT
    a.id             AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.balance_type,
    a.level,
    a.parent_account_id,
    COALESCE(m.debit,  0) AS total_debit,
    COALESCE(m.credit, 0) AS total_credit,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type = 'activo'
      THEN COALESCE(m.debit, 0) - COALESCE(m.credit, 0)
      ELSE COALESCE(m.credit,0) - COALESCE(m.debit,  0)
    END              AS balance
  FROM  _accts a
  LEFT  JOIN _movements m ON m.account_id = a.id
  ORDER BY a.account_code
$$;

-- 3) Update get_ledger_detail
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
  opening_balance numeric
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

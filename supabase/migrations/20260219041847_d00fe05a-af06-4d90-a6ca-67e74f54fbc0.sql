
-- =============================================================================
-- SERVER-SIDE BALANCE RPCs
-- =============================================================================

-- 1. TRIAL BALANCE
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_enterprise_id  bigint,
  p_start_date     date,
  p_end_date       date
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
  _accts AS (
    SELECT a.id, a.account_code, a.account_name, a.account_type,
           a.balance_type, a.level, a.parent_account_id
    FROM   public.tab_accounts a
    WHERE  a.enterprise_id = p_enterprise_id
    AND    a.is_active      = true
    AND    EXISTS (SELECT 1 FROM _access)
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
  )
  SELECT
    a.id                                                         AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.balance_type,
    a.level,
    a.parent_account_id,
    COALESCE(o.debit,  0)                                        AS opening_debit,
    COALESCE(o.credit, 0)                                        AS opening_credit,
    COALESCE(p.debit,  0)                                        AS period_debit,
    COALESCE(p.credit, 0)                                        AS period_credit,
    COALESCE(o.debit,  0) + COALESCE(p.debit,  0)               AS closing_debit,
    COALESCE(o.credit, 0) + COALESCE(p.credit, 0)               AS closing_credit,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type IN ('activo', 'gasto')
      THEN COALESCE(o.debit, 0) - COALESCE(o.credit, 0)
      ELSE COALESCE(o.credit, 0) - COALESCE(o.debit,  0)
    END                                                          AS opening_balance,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type IN ('activo', 'gasto')
      THEN (COALESCE(o.debit,0)+COALESCE(p.debit,0))
           - (COALESCE(o.credit,0)+COALESCE(p.credit,0))
      ELSE (COALESCE(o.credit,0)+COALESCE(p.credit,0))
           - (COALESCE(o.debit,0)+COALESCE(p.debit,0))
    END                                                          AS closing_balance
  FROM  _accts a
  LEFT  JOIN _opening o ON o.account_id = a.id
  LEFT  JOIN _period  p ON p.account_id = a.id
  ORDER BY a.account_code
$$;


-- 2. P&L
CREATE OR REPLACE FUNCTION public.get_pnl(
  p_enterprise_id bigint,
  p_start_date    date,
  p_end_date      date
)
RETURNS TABLE (
  account_id        bigint,
  account_code      text,
  account_name      text,
  account_type      text,
  level             integer,
  parent_account_id bigint,
  period_debit      numeric,
  period_credit     numeric,
  balance           numeric
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


-- 3. BALANCE SHEET
CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_enterprise_id bigint,
  p_as_of_date    date
)
RETURNS TABLE (
  account_id        bigint,
  account_code      text,
  account_name      text,
  account_type      text,
  balance_type      text,
  level             integer,
  parent_account_id bigint,
  total_debit       numeric,
  total_credit      numeric,
  balance           numeric
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


-- 4. LEDGER DETAIL (Libro Mayor)
CREATE OR REPLACE FUNCTION public.get_ledger_detail(
  p_enterprise_id  bigint,
  p_account_ids    bigint[],
  p_start_date     date,
  p_end_date       date
)
RETURNS TABLE (
  detail_id         bigint,
  account_id        bigint,
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
      e.entry_date,
      e.entry_number,
      e.description    AS entry_description,
      d.description    AS line_description,
      COALESCE(d.debit_amount,  0) AS debit_amount,
      COALESCE(d.credit_amount, 0) AS credit_amount
    FROM   public.tab_journal_entry_details d
    JOIN   public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE  e.enterprise_id = p_enterprise_id
    AND    d.account_id    = ANY(p_account_ids)
    AND    e.entry_date   >= p_start_date
    AND    e.entry_date   <= p_end_date
    AND    e.is_posted      = true
    AND    e.deleted_at    IS NULL
    AND    d.deleted_at    IS NULL
    AND    EXISTS (SELECT 1 FROM _access)
  )
  SELECT
    p.detail_id,
    p.account_id,
    p.entry_date,
    p.entry_number,
    p.entry_description,
    p.line_description,
    p.debit_amount,
    p.credit_amount,
    COALESCE(o.debit, 0) - COALESCE(o.credit, 0) AS opening_balance
  FROM  _period  p
  LEFT  JOIN _opening o ON o.account_id = p.account_id
  ORDER BY p.account_id, p.entry_date, p.detail_id
$$;


-- 5. Harden existing get_account_balances_by_period (also filter is_posted)
CREATE OR REPLACE FUNCTION public.get_account_balances_by_period(
  p_enterprise_id bigint,
  p_end_date      date
)
RETURNS TABLE (
  account_id   bigint,
  account_code text,
  account_name text,
  account_type text,
  balance_type text,
  total_debit  numeric,
  total_credit numeric,
  balance      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id                                            AS account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.balance_type,
    COALESCE(SUM(d.debit_amount),  0)               AS total_debit,
    COALESCE(SUM(d.credit_amount), 0)               AS total_credit,
    CASE
      WHEN a.balance_type = 'deudor'
        OR a.account_type IN ('activo', 'gasto')
      THEN COALESCE(SUM(d.debit_amount), 0) - COALESCE(SUM(d.credit_amount), 0)
      ELSE COALESCE(SUM(d.credit_amount), 0) - COALESCE(SUM(d.debit_amount), 0)
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
  GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.balance_type
$$;

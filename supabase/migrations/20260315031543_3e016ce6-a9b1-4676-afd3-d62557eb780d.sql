CREATE OR REPLACE FUNCTION public.get_balance_sheet(p_enterprise_id bigint, p_as_of_date date)
 RETURNS TABLE(account_id bigint, account_code text, account_name text, account_type text, balance_type text, level integer, parent_account_id bigint, total_debit numeric, total_credit numeric, balance numeric)
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
    AND    e.reversal_entry_id IS NULL
    AND    e.reversed_by_entry_id IS NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.get_pnl(p_enterprise_id bigint, p_start_date date, p_end_date date)
 RETURNS TABLE(account_id bigint, account_code text, account_name text, account_type text, level integer, parent_account_id bigint, period_debit numeric, period_credit numeric, balance numeric)
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
    AND    e.reversal_entry_id IS NULL
    AND    e.reversed_by_entry_id IS NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.get_period_profit(p_enterprise_id bigint, p_start_date date, p_end_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
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
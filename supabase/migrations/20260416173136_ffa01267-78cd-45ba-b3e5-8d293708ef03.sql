
CREATE OR REPLACE FUNCTION public.get_account_ledger_as_of(
  p_enterprise_id  bigint,
  p_account_id     bigint,
  p_as_of_date     date,
  p_year           int,
  p_include_drafts boolean DEFAULT false,
  p_limit          int     DEFAULT 200,
  p_offset         int     DEFAULT 0
)
RETURNS TABLE(
  opening_balance_year numeric,
  detail_id            bigint,
  entry_date           date,
  entry_number         text,
  entry_description    text,
  line_description     text,
  debit_amount         numeric,
  credit_amount        numeric,
  running_balance      numeric,
  entry_status         text,
  total_rows           bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening    numeric := 0;
  v_acct_type  text;
  v_bal_type   text;
  v_has_apertura boolean := false;
BEGIN
  -- Access check
  IF NOT (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises ue
      WHERE ue.user_id = auth.uid() AND ue.enterprise_id = p_enterprise_id
    )
  ) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = 'P0030';
  END IF;

  -- Get account type to determine balance sign
  SELECT account_type, balance_type
  INTO v_acct_type, v_bal_type
  FROM public.tab_accounts
  WHERE id = p_account_id
    AND enterprise_id = p_enterprise_id;

  -- Check if an apertura entry exists for this account in this year
  SELECT EXISTS (
    SELECT 1
    FROM public.tab_journal_entry_details d
    JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE e.enterprise_id = p_enterprise_id
      AND d.account_id    = p_account_id
      AND e.entry_number  LIKE 'APER-%'
      AND EXTRACT(YEAR FROM e.entry_date) = p_year
      AND e.is_posted     = true
      AND e.deleted_at   IS NULL
      AND d.deleted_at   IS NULL
  ) INTO v_has_apertura;

  -- Opening balance: all POSTED movements before Jan 1 of p_year
  -- BUT only if there is NO apertura entry for the year (to avoid double-counting)
  IF NOT v_has_apertura THEN
    SELECT
      CASE
        WHEN v_bal_type = 'deudor' OR v_acct_type IN ('activo','gasto')
          THEN COALESCE(SUM(d.debit_amount),0) - COALESCE(SUM(d.credit_amount),0)
        ELSE
          COALESCE(SUM(d.credit_amount),0) - COALESCE(SUM(d.debit_amount),0)
      END
    INTO v_opening
    FROM public.tab_journal_entry_details d
    JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE e.enterprise_id = p_enterprise_id
      AND d.account_id    = p_account_id
      AND e.entry_date    < make_date(p_year, 1, 1)
      AND e.is_posted     = true
      AND e.deleted_at   IS NULL
      AND d.deleted_at   IS NULL;
  END IF;

  v_opening := COALESCE(v_opening, 0);

  -- Return rows with running balance
  RETURN QUERY
  WITH period_rows AS (
    SELECT
      d.id            AS detail_id,
      e.entry_date,
      e.entry_number,
      e.description   AS entry_description,
      d.description   AS line_description,
      COALESCE(d.debit_amount,  0) AS debit_amount,
      COALESCE(d.credit_amount, 0) AS credit_amount,
      e.status        AS entry_status,
      COUNT(*) OVER() AS total_rows
    FROM public.tab_journal_entry_details d
    JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
    WHERE e.enterprise_id = p_enterprise_id
      AND d.account_id    = p_account_id
      AND EXTRACT(YEAR FROM e.entry_date) = p_year
      AND e.entry_date   <= p_as_of_date
      AND (p_include_drafts OR e.is_posted = true)
      AND e.deleted_at   IS NULL
      AND d.deleted_at   IS NULL
    ORDER BY e.entry_date, d.id
    LIMIT  p_limit
    OFFSET p_offset
  ),
  with_running AS (
    SELECT
      pr.*,
      v_opening + SUM(
        CASE
          WHEN v_bal_type = 'deudor' OR v_acct_type IN ('activo','gasto')
            THEN pr.debit_amount - pr.credit_amount
          ELSE
            pr.credit_amount - pr.debit_amount
        END
      ) OVER (ORDER BY pr.entry_date, pr.detail_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
      AS running_balance
    FROM period_rows pr
  )
  SELECT
    v_opening            AS opening_balance_year,
    wr.detail_id,
    wr.entry_date,
    wr.entry_number,
    wr.entry_description,
    wr.line_description,
    wr.debit_amount,
    wr.credit_amount,
    wr.running_balance,
    wr.entry_status,
    wr.total_rows
  FROM with_running wr
  ORDER BY wr.entry_date, wr.detail_id;
END;
$$;

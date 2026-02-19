
-- ============================================================
-- DB-LEVEL ACCOUNTING INVARIANTS & PERFORMANCE VIEWS
-- ============================================================

-- 1. Function: get_account_balances_by_period
--    Returns all account balances for an enterprise up to a given date.
--    Replaces heavy client-side aggregation in Dashboard.tsx.
CREATE OR REPLACE FUNCTION public.get_account_balances_by_period(
  p_enterprise_id BIGINT,
  p_end_date      DATE
)
RETURNS TABLE (
  account_id   BIGINT,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  balance_type TEXT,
  total_debit  NUMERIC,
  total_credit NUMERIC,
  balance      NUMERIC
)
LANGUAGE SQL
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
  WHERE a.enterprise_id = p_enterprise_id
    AND a.is_active     = true
  GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.balance_type
$$;

-- 2. Function: get_period_profit
--    Returns income - expenses for a date range.
CREATE OR REPLACE FUNCTION public.get_period_profit(
  p_enterprise_id BIGINT,
  p_start_date    DATE,
  p_end_date      DATE
)
RETURNS NUMERIC
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  JOIN public.tab_accounts a
    ON a.id            = d.account_id
    AND a.enterprise_id = p_enterprise_id
    AND a.account_type IN ('ingreso', 'gasto')
  WHERE d.deleted_at IS NULL
$$;

-- 3. Function: get_monthly_ledger_summary
--    Returns monthly totals for sales or purchases (for yearly charts).
CREATE OR REPLACE FUNCTION public.get_monthly_ledger_summary(
  p_enterprise_id BIGINT,
  p_year          INT,
  p_ledger        TEXT  -- 'sales' or 'purchases'
)
RETURNS TABLE (
  month_num   INT,
  total       NUMERIC,
  base_amount NUMERIC,
  vat_amount  NUMERIC,
  record_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ledger = 'sales' THEN
    RETURN QUERY
      SELECT
        EXTRACT(MONTH FROM invoice_date)::INT AS month_num,
        COALESCE(SUM(total_amount), 0)        AS total,
        COALESCE(SUM(net_amount),   0)        AS base_amount,
        COALESCE(SUM(vat_amount),   0)        AS vat_amount,
        COUNT(*)                              AS record_count
      FROM public.tab_sales_ledger
      WHERE enterprise_id = p_enterprise_id
        AND EXTRACT(YEAR FROM invoice_date) = p_year
        AND is_annulled = false
        AND deleted_at  IS NULL
      GROUP BY EXTRACT(MONTH FROM invoice_date);
  ELSE
    RETURN QUERY
      SELECT
        EXTRACT(MONTH FROM invoice_date)::INT AS month_num,
        COALESCE(SUM(total_amount), 0)        AS total,
        COALESCE(SUM(base_amount),  0)        AS base_amount,
        COALESCE(SUM(vat_amount),   0)        AS vat_amount,
        COUNT(*)                              AS record_count
      FROM public.tab_purchase_ledger
      WHERE enterprise_id = p_enterprise_id
        AND EXTRACT(YEAR FROM invoice_date) = p_year
        AND deleted_at IS NULL
      GROUP BY EXTRACT(MONTH FROM invoice_date);
  END IF;
END;
$$;

-- 4. Trigger: enforce_posted_entry_immutability
--    Prevents modification of 'contabilizado' entries (posted=true, status='contabilizado').
--    Corrections must be done via reversal entries (REV- prefix).
CREATE OR REPLACE FUNCTION public.enforce_journal_entry_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow status transitions that are part of the voiding workflow
  -- (the void function sets deleted_at, or changes status to 'anulado')
  IF OLD.is_posted = true AND OLD.status = 'contabilizado' THEN
    -- Allow only: setting deleted_at (soft delete / reversal workflow)
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RETURN NEW; -- Allow soft-delete (void/reversal)
    END IF;
    -- Allow updating audit fields only
    IF (
      OLD.entry_number        = NEW.entry_number AND
      OLD.entry_date          = NEW.entry_date   AND
      OLD.entry_type          = NEW.entry_type   AND
      OLD.accounting_period_id = NEW.accounting_period_id AND
      OLD.description         = NEW.description  AND
      OLD.total_debit         = NEW.total_debit  AND
      OLD.total_credit        = NEW.total_credit AND
      OLD.enterprise_id       = NEW.enterprise_id
    ) THEN
      RETURN NEW; -- Only metadata changed (updated_by, updated_at, etc.)
    END IF;
    RAISE EXCEPTION 'Las partidas contabilizadas son inmutables. Use una partida de reversión (REV-) para corregir.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_entry_immutability ON public.tab_journal_entries;
CREATE TRIGGER trg_journal_entry_immutability
  BEFORE UPDATE ON public.tab_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_journal_entry_immutability();

-- 5. Trigger: enforce_balanced_entry_on_post
--    Prevents posting an unbalanced entry at the DB level.
--    Client-side validation already checks this, but DB is the last line of defense.
CREATE OR REPLACE FUNCTION public.enforce_balanced_entry_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_debit  NUMERIC;
  v_total_credit NUMERIC;
  v_diff         NUMERIC;
BEGIN
  -- Only validate when posting (is_posted transitions to true)
  IF NEW.is_posted = true AND (OLD.is_posted = false OR OLD.is_posted IS NULL) THEN
    SELECT
      COALESCE(SUM(debit_amount),  0),
      COALESCE(SUM(credit_amount), 0)
    INTO v_total_debit, v_total_credit
    FROM public.tab_journal_entry_details
    WHERE journal_entry_id = NEW.id
      AND deleted_at IS NULL;

    v_diff := ABS(v_total_debit - v_total_credit);

    IF v_diff > 0.01 THEN
      RAISE EXCEPTION 'No se puede contabilizar una partida desbalanceada. Debe: %, Haber: %, Diferencia: %',
        v_total_debit, v_total_credit, v_diff
        USING ERRCODE = 'P0002';
    END IF;

    IF v_total_debit = 0 THEN
      RAISE EXCEPTION 'No se puede contabilizar una partida sin movimientos.'
        USING ERRCODE = 'P0003';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_balanced_on_post ON public.tab_journal_entries;
CREATE TRIGGER trg_enforce_balanced_on_post
  BEFORE UPDATE ON public.tab_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_balanced_entry_on_post();

-- Also enforce on INSERT (for entries inserted already posted)
DROP TRIGGER IF EXISTS trg_enforce_balanced_on_insert ON public.tab_journal_entries;
CREATE TRIGGER trg_enforce_balanced_on_insert
  AFTER INSERT ON public.tab_journal_entries
  FOR EACH ROW
  WHEN (NEW.is_posted = true)
  EXECUTE FUNCTION public.enforce_balanced_entry_on_post();

-- 6. Trigger: enforce_open_period_on_post
--    Prevents posting an entry in a closed accounting period.
CREATE OR REPLACE FUNCTION public.enforce_open_period_on_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_status TEXT;
BEGIN
  -- Only check when posting
  IF NEW.is_posted = true AND (OLD.is_posted = false OR OLD.is_posted IS NULL) THEN
    IF NEW.accounting_period_id IS NOT NULL THEN
      SELECT status INTO v_period_status
      FROM public.tab_accounting_periods
      WHERE id = NEW.accounting_period_id;

      IF v_period_status IS DISTINCT FROM 'abierto' THEN
        RAISE EXCEPTION 'No se puede contabilizar en un período cerrado (estado: %). Solo se permiten partidas en períodos abiertos.',
          COALESCE(v_period_status, 'desconocido')
          USING ERRCODE = 'P0004';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_open_period_on_post ON public.tab_journal_entries;
CREATE TRIGGER trg_enforce_open_period_on_post
  BEFORE UPDATE ON public.tab_journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_open_period_on_post();

-- Grant execute on new functions to authenticated role
GRANT EXECUTE ON FUNCTION public.get_account_balances_by_period(BIGINT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_period_profit(BIGINT, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_ledger_summary(BIGINT, INT, TEXT) TO authenticated;

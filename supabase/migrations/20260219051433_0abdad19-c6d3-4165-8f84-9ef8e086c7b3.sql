
-- Fix ambiguous column reference "vat_amount" in get_monthly_ledger_summary
CREATE OR REPLACE FUNCTION public.get_monthly_ledger_summary(
  p_enterprise_id BIGINT,
  p_year          INTEGER,
  p_ledger        TEXT   -- 'sales' or 'purchases'
)
RETURNS TABLE(
  month_num    INT,
  total        NUMERIC,
  base_amount  NUMERIC,
  vat_amount   NUMERIC,
  record_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_ledger = 'sales' THEN
    RETURN QUERY
      SELECT
        EXTRACT(MONTH FROM s.invoice_date)::INT         AS month_num,
        COALESCE(SUM(s.total_amount), 0)               AS total,
        COALESCE(SUM(s.net_amount),   0)               AS base_amount,
        COALESCE(SUM(s.vat_amount),   0)               AS vat_amount,
        COUNT(*)                                        AS record_count
      FROM public.tab_sales_ledger s
      WHERE s.enterprise_id = p_enterprise_id
        AND EXTRACT(YEAR FROM s.invoice_date) = p_year
        AND s.is_annulled = false
        AND s.deleted_at  IS NULL
      GROUP BY EXTRACT(MONTH FROM s.invoice_date);

  ELSIF p_ledger = 'purchases' THEN
    RETURN QUERY
      SELECT
        EXTRACT(MONTH FROM p.invoice_date)::INT         AS month_num,
        COALESCE(SUM(p.total_amount), 0)               AS total,
        COALESCE(SUM(p.net_amount),   0)               AS base_amount,
        COALESCE(SUM(p.vat_amount),   0)               AS vat_amount,
        COUNT(*)                                        AS record_count
      FROM public.tab_purchase_ledger p
      WHERE p.enterprise_id = p_enterprise_id
        AND EXTRACT(YEAR FROM p.invoice_date) = p_year
        AND p.deleted_at IS NULL
      GROUP BY EXTRACT(MONTH FROM p.invoice_date);

  END IF;
END;
$$;

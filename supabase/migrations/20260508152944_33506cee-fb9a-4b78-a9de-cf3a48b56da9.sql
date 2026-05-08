
CREATE OR REPLACE FUNCTION public.get_book_summaries_latest(p_enterprise_id integer)
RETURNS TABLE (
  ledger text,
  year   integer,
  month  integer,
  base   numeric,
  vat    numeric,
  total  numeric,
  cnt    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH _auth AS (
    SELECT public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises ue
      WHERE ue.user_id = auth.uid() AND ue.enterprise_id = p_enterprise_id
    ) AS allowed
  ),
  purchases AS (
    SELECT 'purchases'::text AS ledger,
           EXTRACT(YEAR  FROM invoice_date)::int AS year,
           EXTRACT(MONTH FROM invoice_date)::int AS month,
           COALESCE(SUM(net_amount),   0)::numeric AS base,
           COALESCE(SUM(vat_amount),   0)::numeric AS vat,
           COALESCE(SUM(total_amount), 0)::numeric AS total,
           COUNT(*)::int AS cnt
    FROM public.tab_purchase_ledger
    WHERE enterprise_id = p_enterprise_id
      AND deleted_at IS NULL
      AND (SELECT allowed FROM _auth)
    GROUP BY 2, 3
    ORDER BY year DESC, month DESC
    LIMIT 2
  ),
  sales AS (
    SELECT 'sales'::text AS ledger,
           EXTRACT(YEAR  FROM invoice_date)::int AS year,
           EXTRACT(MONTH FROM invoice_date)::int AS month,
           COALESCE(SUM(net_amount),   0)::numeric AS base,
           COALESCE(SUM(vat_amount),   0)::numeric AS vat,
           COALESCE(SUM(total_amount), 0)::numeric AS total,
           COUNT(*)::int AS cnt
    FROM public.tab_sales_ledger
    WHERE enterprise_id = p_enterprise_id
      AND is_annulled = false
      AND (SELECT allowed FROM _auth)
    GROUP BY 2, 3
    ORDER BY year DESC, month DESC
    LIMIT 2
  )
  SELECT * FROM purchases
  UNION ALL
  SELECT * FROM sales;
$$;

GRANT EXECUTE ON FUNCTION public.get_book_summaries_latest(integer) TO authenticated;

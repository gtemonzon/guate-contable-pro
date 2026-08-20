CREATE OR REPLACE FUNCTION public.get_batch_purchase_mappings(
  p_enterprise_id bigint,
  p_supplier_nits text[],
  p_reference_date date DEFAULT NULL
)
RETURNS TABLE(supplier_nit text, expense_account_id bigint, operation_type_id bigint, source_date date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.user_is_linked_to_enterprise(auth.uid(), p_enterprise_id)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH nits AS (
    SELECT DISTINCT UPPER(TRIM(REPLACE(REPLACE(n, '-', ''), ' ', ''))) AS normalized_nit
    FROM UNNEST(p_supplier_nits) AS n
  ),
  candidates AS (
    SELECT
      nits.normalized_nit,
      pl.expense_account_id::bigint AS expense_account_id,
      pl.operation_type_id::bigint AS operation_type_id,
      pl.invoice_date,
      pl.id,
      -- 0 = dentro de la ventana de 12 meses (preferido), 1 = fallback histórico
      CASE
        WHEN p_reference_date IS NULL THEN
          CASE WHEN pl.invoice_date >= (CURRENT_DATE - INTERVAL '12 months') THEN 0 ELSE 1 END
        ELSE
          CASE WHEN pl.invoice_date >= (p_reference_date - INTERVAL '12 months')
                AND pl.invoice_date <= p_reference_date THEN 0 ELSE 1 END
      END AS window_rank
    FROM nits
    JOIN public.tab_purchase_ledger pl
      ON pl.supplier_nit = nits.normalized_nit
     AND pl.enterprise_id = p_enterprise_id
     AND pl.deleted_at IS NULL
     AND (pl.expense_account_id IS NOT NULL OR pl.operation_type_id IS NOT NULL)
  )
  SELECT DISTINCT ON (c.normalized_nit)
    c.normalized_nit AS supplier_nit,
    c.expense_account_id,
    c.operation_type_id,
    c.invoice_date AS source_date
  FROM candidates c
  ORDER BY c.normalized_nit, c.window_rank, c.invoice_date DESC, c.id DESC;
END;
$function$;
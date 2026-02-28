
-- RPC: Get last-used operation_type and expense_account for a supplier NIT within an enterprise
-- Returns the most recent purchase's operation_type_id and expense_account_id (within last 12 months)
CREATE OR REPLACE FUNCTION public.get_last_purchase_mapping(
  p_enterprise_id bigint,
  p_supplier_nit text
)
RETURNS TABLE(
  expense_account_id bigint,
  operation_type_id bigint,
  source_invoice_id bigint,
  source_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    pl.expense_account_id::bigint,
    pl.operation_type_id::bigint,
    pl.id::bigint AS source_invoice_id,
    pl.invoice_date AS source_date
  FROM public.tab_purchase_ledger pl
  WHERE pl.enterprise_id = p_enterprise_id
    AND pl.supplier_nit = UPPER(TRIM(REPLACE(REPLACE(p_supplier_nit, '-', ''), ' ', '')))
    AND pl.deleted_at IS NULL
    AND (pl.expense_account_id IS NOT NULL OR pl.operation_type_id IS NOT NULL)
    AND pl.invoice_date >= (CURRENT_DATE - INTERVAL '12 months')
  ORDER BY pl.invoice_date DESC, pl.id DESC
  LIMIT 1;
$$;

-- Batch version: Get mappings for multiple NITs at once (for import scenarios)
CREATE OR REPLACE FUNCTION public.get_batch_purchase_mappings(
  p_enterprise_id bigint,
  p_supplier_nits text[]
)
RETURNS TABLE(
  supplier_nit text,
  expense_account_id bigint,
  operation_type_id bigint,
  source_date date
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (normalized_nit)
    normalized_nit AS supplier_nit,
    pl.expense_account_id::bigint,
    pl.operation_type_id::bigint,
    pl.invoice_date AS source_date
  FROM (
    SELECT UNNEST(p_supplier_nits) AS raw_nit,
           UPPER(TRIM(REPLACE(REPLACE(UNNEST(p_supplier_nits), '-', ''), ' ', ''))) AS normalized_nit
  ) nits
  JOIN public.tab_purchase_ledger pl
    ON pl.supplier_nit = nits.normalized_nit
    AND pl.enterprise_id = p_enterprise_id
    AND pl.deleted_at IS NULL
    AND (pl.expense_account_id IS NOT NULL OR pl.operation_type_id IS NOT NULL)
    AND pl.invoice_date >= (CURRENT_DATE - INTERVAL '12 months')
  ORDER BY normalized_nit, pl.invoice_date DESC, pl.id DESC;
$$;

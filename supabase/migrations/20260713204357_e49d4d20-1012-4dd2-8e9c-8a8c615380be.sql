
-- 1. Purchase mapping RPCs: membership check
CREATE OR REPLACE FUNCTION public.get_last_purchase_mapping(p_enterprise_id bigint, p_supplier_nit text)
 RETURNS TABLE(expense_account_id bigint, operation_type_id bigint, source_invoice_id bigint, source_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.user_is_linked_to_enterprise(auth.uid(), p_enterprise_id)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pl.expense_account_id::bigint, pl.operation_type_id::bigint, pl.id::bigint, pl.invoice_date
  FROM public.tab_purchase_ledger pl
  WHERE pl.enterprise_id = p_enterprise_id
    AND pl.supplier_nit = UPPER(TRIM(REPLACE(REPLACE(p_supplier_nit, '-', ''), ' ', '')))
    AND pl.deleted_at IS NULL
    AND (pl.expense_account_id IS NOT NULL OR pl.operation_type_id IS NOT NULL)
    AND pl.invoice_date >= (CURRENT_DATE - INTERVAL '12 months')
  ORDER BY pl.invoice_date DESC, pl.id DESC
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_batch_purchase_mappings(p_enterprise_id bigint, p_supplier_nits text[])
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
END;
$function$;

-- 2. link_account_parents_by_code membership check
CREATE OR REPLACE FUNCTION public.link_account_parents_by_code(p_enterprise_id integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer := 0;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.user_is_linked_to_enterprise(auth.uid(), p_enterprise_id::bigint)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;

  WITH updates AS (
    SELECT c.id AS child_id, p.id AS parent_id,
      CASE length(c.account_code)
        WHEN 8 THEN 5 WHEN 6 THEN 4 WHEN 4 THEN 3 WHEN 2 THEN 2 ELSE 1
      END AS new_level
    FROM tab_accounts c
    LEFT JOIN tab_accounts p
      ON p.enterprise_id = c.enterprise_id
     AND (
      (length(c.account_code) = 8 AND length(p.account_code) = 6 AND p.account_code = substr(c.account_code, 1, 6)) OR
      (length(c.account_code) = 6 AND length(p.account_code) = 4 AND p.account_code = substr(c.account_code, 1, 4)) OR
      (length(c.account_code) = 4 AND length(p.account_code) = 2 AND p.account_code = substr(c.account_code, 1, 2)) OR
      (length(c.account_code) = 2 AND length(p.account_code) = 1 AND p.account_code = substr(c.account_code, 1, 1))
     )
    WHERE c.enterprise_id = p_enterprise_id
  )
  UPDATE tab_accounts t
     SET parent_account_id = u.parent_id, level = u.new_level
    FROM updates u
   WHERE t.id = u.child_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;

  UPDATE tab_accounts t
     SET allows_movement = NOT EXISTS (
           SELECT 1 FROM tab_accounts c
            WHERE c.enterprise_id = t.enterprise_id
              AND c.parent_account_id = t.id
         )
   WHERE t.enterprise_id = p_enterprise_id;

  RETURN updated_count;
END;
$function$;

-- 3. initialize_default_permissions membership check
CREATE OR REPLACE FUNCTION public.initialize_default_permissions(p_enterprise_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.is_admin_for_enterprise(auth.uid(), p_enterprise_id)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public._initialize_default_permissions_impl(p_enterprise_id);
END;
$function$;

-- 4. Journal counter RPCs — wrap with membership check
CREATE OR REPLACE FUNCTION public.allocate_journal_entry_number(p_enterprise_id bigint, p_entry_type text, p_entry_date date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix_code text; v_prefix text; v_year int; v_month int; v_next_number int;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.user_is_linked_to_enterprise(auth.uid(), p_enterprise_id)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');
  SELECT prefix INTO v_prefix FROM public.tab_journal_entry_prefixes WHERE code = v_prefix_code AND is_active = true LIMIT 1;
  v_prefix := COALESCE(v_prefix, 'PART');
  v_year := EXTRACT(YEAR FROM p_entry_date)::int;
  v_month := EXTRACT(MONTH FROM p_entry_date)::int;
  INSERT INTO public.journal_entry_counters (enterprise_id, prefix, year, month, last_number, updated_at)
  VALUES (p_enterprise_id, 'ALL', v_year, v_month, 1, now())
  ON CONFLICT (enterprise_id, prefix, year, month)
  DO UPDATE SET last_number = journal_entry_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next_number;
  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_month::text,2,'0') || '-' || lpad(v_next_number::text,4,'0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.preview_next_entry_number(p_enterprise_id bigint, p_entry_type text, p_entry_date date)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix_code text; v_prefix text; v_year int; v_month int; v_current_number int; v_next_number int;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  IF NOT (public.is_super_admin(auth.uid()) OR public.user_is_linked_to_enterprise(auth.uid(), p_enterprise_id)) THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  END IF;
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');
  SELECT prefix INTO v_prefix FROM public.tab_journal_entry_prefixes WHERE code = v_prefix_code AND is_active = true LIMIT 1;
  v_prefix := COALESCE(v_prefix, 'PART');
  v_year := EXTRACT(YEAR FROM p_entry_date)::int;
  v_month := EXTRACT(MONTH FROM p_entry_date)::int;
  SELECT last_number INTO v_current_number FROM public.journal_entry_counters
    WHERE enterprise_id = p_enterprise_id AND prefix = 'ALL' AND year = v_year AND month = v_month;
  v_next_number := COALESCE(v_current_number, 0) + 1;
  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_month::text,2,'0') || '-' || lpad(v_next_number::text,4,'0');
END;
$function$;

-- 5. tab_bank_movements: enforce NOT NULL on bank_account_id (no null rows exist)
ALTER TABLE public.tab_bank_movements ALTER COLUMN bank_account_id SET NOT NULL;

-- 6. tab_operation_types: prevent non-super-admins from inserting/updating system rows (enterprise_id IS NULL)
DROP POLICY IF EXISTS "Users can insert operation types" ON public.tab_operation_types;
CREATE POLICY "Users can insert operation types" ON public.tab_operation_types
  FOR INSERT TO authenticated
  WITH CHECK (
    (enterprise_id IS NOT NULL AND enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ))
    OR (enterprise_id IS NULL AND public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update operation types" ON public.tab_operation_types;
CREATE POLICY "Users can update operation types" ON public.tab_operation_types
  FOR UPDATE TO authenticated
  USING (
    (enterprise_id IS NOT NULL AND is_system = false AND enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ))
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete operation types" ON public.tab_operation_types;
CREATE POLICY "Users can delete operation types" ON public.tab_operation_types
  FOR DELETE TO authenticated
  USING (
    (enterprise_id IS NOT NULL AND is_system = false AND enterprise_id IN (
      SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
    ))
    OR public.is_super_admin(auth.uid())
  );

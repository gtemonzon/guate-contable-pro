CREATE OR REPLACE FUNCTION public.allocate_journal_entry_number(p_enterprise_id bigint, p_entry_type text, p_entry_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix_code text; v_prefix text; v_year int; v_month int; v_next_number int;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","traslado":"TRANSFER","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES","depreciacion":"DEPRECIATION"}'::jsonb;
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
$$;
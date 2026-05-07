CREATE OR REPLACE FUNCTION public.audit_trigger_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_enterprise_id bigint;
  v_old_data jsonb;
  v_new_data jsonb;
  v_record_id bigint;
  v_excluded_columns text[] := ARRAY[
    'last_activity_at',
    'last_activity',
    'updated_at',
    'updated_by',
    'created_at',
    'created_by',
    'reviewed_at',
    'reviewed_by',
    'posted_at',
    'closed_at',
    'closed_by',
    'deleted_at',
    'deleted_by',
    'read_at',
    'uploaded_at',
    'uploaded_by',
    'current_enterprise_name',
    'modified_by',
    'user_modified'
  ];
  v_old_filtered jsonb;
  v_new_filtered jsonb;
  v_col text;
BEGIN
  IF current_setting('app.import_mode', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_enterprise_id := OLD.enterprise_id;
      v_record_id := OLD.id;
    ELSE
      v_enterprise_id := NEW.enterprise_id;
      v_record_id := NEW.id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    v_enterprise_id := NULL;
    IF TG_OP = 'DELETE' THEN
      v_record_id := OLD.id;
    ELSE
      v_record_id := NEW.id;
    END IF;
  END;

  IF TG_OP = 'DELETE' THEN
    v_old_data := to_jsonb(OLD);
    v_new_data := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old_data := NULL;
    v_new_data := to_jsonb(NEW);
  ELSE
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);

    v_old_filtered := v_old_data;
    v_new_filtered := v_new_data;

    FOREACH v_col IN ARRAY v_excluded_columns LOOP
      v_old_filtered := v_old_filtered - v_col;
      v_new_filtered := v_new_filtered - v_col;
    END LOOP;

    IF v_old_filtered = v_new_filtered THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.tab_audit_log (
    enterprise_id,
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    v_enterprise_id,
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id,
    v_old_data,
    v_new_data
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_event_log_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_entity_type   TEXT;
  v_entity_id     BIGINT;
  v_enterprise_id BIGINT;
  v_tenant_id     BIGINT;
  v_before_json   JSONB;
  v_after_json    JSONB;
  v_action        TEXT;
  v_excluded      TEXT[] := ARRAY[
    'updated_at','updated_by','created_at','created_by',
    'posted_at','reviewed_at','reviewed_by',
    'last_activity_at','current_enterprise_name',
    'closed_at','closed_by','deleted_at','deleted_by','read_at',
    'uploaded_at','uploaded_by',
    'modified_by','user_modified'
  ];
  v_old_clean     JSONB;
  v_new_clean     JSONB;
  v_col           TEXT;
BEGIN
  IF current_setting('app.import_mode', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_action      := TG_OP;
  v_entity_type := TG_TABLE_NAME;

  IF TG_OP = 'DELETE' THEN
    BEGIN v_entity_id     := OLD.id; EXCEPTION WHEN undefined_column THEN v_entity_id := NULL; END;
    BEGIN v_enterprise_id := OLD.enterprise_id; EXCEPTION WHEN undefined_column THEN v_enterprise_id := NULL; END;
    v_before_json := to_jsonb(OLD);
    v_after_json  := NULL;
  ELSE
    BEGIN v_entity_id     := NEW.id; EXCEPTION WHEN undefined_column THEN v_entity_id := NULL; END;
    BEGIN v_enterprise_id := NEW.enterprise_id; EXCEPTION WHEN undefined_column THEN v_enterprise_id := NULL; END;
    v_after_json  := to_jsonb(NEW);
    v_before_json := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_clean := to_jsonb(OLD);
    v_new_clean := to_jsonb(NEW);
    FOREACH v_col IN ARRAY v_excluded LOOP
      v_old_clean := v_old_clean - v_col;
      v_new_clean := v_new_clean - v_col;
    END LOOP;
    IF v_old_clean = v_new_clean THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_enterprise_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM public.tab_enterprises WHERE id = v_enterprise_id;
  ELSE
    v_tenant_id := public.current_tenant_id();
  END IF;

  PERFORM public.write_audit_event(
    auth.uid(),
    v_tenant_id,
    v_enterprise_id,
    v_entity_type,
    v_entity_id,
    v_action,
    v_before_json,
    v_after_json,
    NULL,
    NULL
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.block_asset_event_log_mutations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.import_mode', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'fixed_asset_event_log is append-only. UPDATE and DELETE are not permitted.'
    USING ERRCODE = 'P0021';
END;
$function$;

CREATE OR REPLACE FUNCTION public.hard_reset_legacy_import_enterprise(p_enterprise_id bigint)
RETURNS TABLE(phase_key text, table_name text, deleted_count bigint, remaining_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_before bigint;
  v_after bigint;
  v_phase_deleted bigint;
  v_remaining_accounts bigint;
BEGIN
  PERFORM set_config('app.import_mode', 'on', true);

  SELECT count(*) INTO v_before FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.tab_purchase_journal_links WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'purchase_journal_links_clear', 'tab_purchase_journal_links', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.tab_purchase_ledger WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'purchase_ledger_clear', 'tab_purchase_ledger', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.tab_purchase_books WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'purchase_books_clear', 'tab_purchase_books', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before
  FROM public.tab_journal_entry_details d
  JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
  WHERE e.enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_journal_entry_details d
  USING public.tab_journal_entries e
  WHERE e.id = d.journal_entry_id
    AND e.enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after
  FROM public.tab_journal_entry_details d
  JOIN public.tab_journal_entries e ON e.id = d.journal_entry_id
  WHERE e.enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'journal_entry_details_clear', 'tab_journal_entry_details', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.tab_journal_entries WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'journal_entries_clear', 'tab_journal_entries', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before
  FROM public.fixed_asset_depreciation_schedule d
  JOIN public.fixed_assets a ON a.id = d.asset_id
  WHERE a.enterprise_id = p_enterprise_id;
  DELETE FROM public.fixed_asset_depreciation_schedule d
  USING public.fixed_assets a
  WHERE a.id = d.asset_id
    AND a.enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after
  FROM public.fixed_asset_depreciation_schedule d
  JOIN public.fixed_assets a ON a.id = d.asset_id
  WHERE a.enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'fixed_asset_depreciation_schedule_clear', 'fixed_asset_depreciation_schedule', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.fixed_assets WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'fixed_assets_clear', 'fixed_assets', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.fixed_asset_categories WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'asset_categories_clear', 'fixed_asset_categories', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.tab_sales_ledger WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'sales_ledger_clear', 'tab_sales_ledger', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.tab_period_inventory_closing WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'inventory_closings_clear', 'tab_period_inventory_closing', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
  DELETE FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
  SELECT count(*) INTO v_after FROM public.tab_accounting_periods WHERE enterprise_id = p_enterprise_id;
  v_phase_deleted := COALESCE(v_before, 0) - COALESCE(v_after, 0);
  RETURN QUERY SELECT 'periods_clear', 'tab_accounting_periods', v_phase_deleted, v_after;

  SELECT count(*) INTO v_before FROM public.tab_accounts WHERE enterprise_id = p_enterprise_id;
  LOOP
    DELETE FROM public.tab_accounts a
    WHERE a.enterprise_id = p_enterprise_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.tab_accounts c
        WHERE c.parent_account_id = a.id
          AND c.enterprise_id = p_enterprise_id
      );

    GET DIAGNOSTICS v_phase_deleted = ROW_COUNT;
    EXIT WHEN v_phase_deleted = 0;
  END LOOP;
  SELECT count(*) INTO v_remaining_accounts FROM public.tab_accounts WHERE enterprise_id = p_enterprise_id;
  v_after := v_remaining_accounts;
  RETURN QUERY SELECT 'accounts_clear', 'tab_accounts', COALESCE(v_before, 0) - COALESCE(v_after, 0), v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.hard_reset_legacy_import_enterprise(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hard_reset_legacy_import_enterprise(bigint) TO authenticated;
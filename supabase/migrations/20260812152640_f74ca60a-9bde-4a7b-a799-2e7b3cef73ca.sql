-- 1) hard_reset_enterprise: require admin role, not mere membership
CREATE OR REPLACE FUNCTION public.hard_reset_enterprise(p_enterprise_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_stats jsonb := '[]'::jsonb;
  v_start timestamptz;
  v_t0    timestamptz;
  v_deleted bigint;
  v_remaining bigint;
  v_tbl text;
  v_sql text;
  v_lock_key bigint;
  v_uid uuid := auth.uid();
  v_tables text[] := ARRAY[
    'tab_purchase_journal_links','tab_journal_entry_history','tab_journal_entry_metadata_changes',
    'tab_purchase_ledger','tab_sales_ledger','tab_purchase_books','tab_period_inventory_closing',
    'tab_bank_movements','tab_bank_documents','tab_bank_reconciliations','tab_bank_import_templates',
    'tab_bank_accounts','fixed_asset_depreciation_schedule','fixed_asset_event_log','fixed_assets',
    'fixed_asset_categories','fixed_asset_locations','fixed_asset_custodians','fixed_asset_suppliers',
    'fixed_asset_policy','tab_fx_settlements','tab_fx_open_balances','tab_fx_revaluation_runs',
    'tab_journal_entry_details','tab_journal_entries','tab_integrity_validations','tab_accounting_periods',
    'tab_book_folio_consumption','tab_book_authorizations','tab_integrity_rules_config','tab_holidays',
    'tab_tax_due_date_config','tab_alert_config','tab_custom_reminders','tab_notifications',
    'tab_role_permissions','tab_dashboard_card_config','tab_backup_history','tab_operation_types',
    'tab_tax_forms','tab_audit_log','tab_import_logs','tab_exchange_rates','tab_accounts'
  ];
BEGIN
  -- Authorization: service role (no auth.uid()) OR enterprise/super admin only
  IF v_uid IS NOT NULL AND NOT public.is_admin_for_enterprise(v_uid, p_enterprise_id) THEN
    RAISE EXCEPTION 'Permission denied for enterprise %', p_enterprise_id USING ERRCODE = '42501';
  END IF;

  v_lock_key := 7777777000000 + p_enterprise_id;
  IF NOT pg_try_advisory_xact_lock(v_lock_key) THEN
    RAISE EXCEPTION 'Another reset is already in progress for enterprise %', p_enterprise_id USING ERRCODE = '55P03';
  END IF;

  v_start := clock_timestamp();
  PERFORM set_config('app.import_mode', 'on', true);

  FOREACH v_tbl IN ARRAY v_tables LOOP
    v_t0 := clock_timestamp();
    IF v_tbl IN ('tab_purchase_journal_links','tab_journal_entry_history','tab_journal_entry_metadata_changes','tab_journal_entry_details') THEN
      v_sql := format('DELETE FROM public.%I t WHERE t.journal_entry_id IN (SELECT id FROM public.tab_journal_entries WHERE enterprise_id = %L)', v_tbl, p_enterprise_id);
    ELSIF v_tbl = 'tab_book_folio_consumption' THEN
      v_sql := format('DELETE FROM public.%I t WHERE t.authorization_id IN (SELECT id FROM public.tab_book_authorizations WHERE enterprise_id = %L)', v_tbl, p_enterprise_id);
    ELSE
      v_sql := format('DELETE FROM public.%I WHERE enterprise_id = %L', v_tbl, p_enterprise_id);
    END IF;

    EXECUTE v_sql;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    v_stats := v_stats || jsonb_build_object(
      'table', v_tbl,
      'deleted', v_deleted,
      'ms', round(EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'enterprise_id', p_enterprise_id,
    'total_ms', round(EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000),
    'phases', v_stats
  );
END;
$function$;

-- 2) calculate_account_balance_for_overdraft: membership check
CREATE OR REPLACE FUNCTION public.calculate_account_balance_for_overdraft(p_account_id bigint, p_enterprise_id bigint, p_entry_date date, p_exclude_entry_id bigint DEFAULT NULL::bigint)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result numeric;
BEGIN
  IF v_uid IS NOT NULL AND NOT (
    public.is_super_admin(v_uid) OR public.user_is_linked_to_enterprise(v_uid, p_enterprise_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied for enterprise %', p_enterprise_id USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(d.debit_amount - d.credit_amount), 0)::numeric INTO v_result
  FROM tab_journal_entry_details d
  JOIN tab_journal_entries j ON j.id = d.journal_entry_id
  WHERE d.account_id = p_account_id
    AND j.enterprise_id = p_enterprise_id
    AND j.is_posted = true
    AND j.deleted_at IS NULL
    AND j.entry_date >= make_date(EXTRACT(YEAR FROM p_entry_date)::int, 1, 1)
    AND j.entry_date <= make_date(EXTRACT(YEAR FROM p_entry_date)::int, 12, 31)
    AND (p_exclude_entry_id IS NULL OR j.id <> p_exclude_entry_id);

  RETURN v_result;
END;
$function$;

-- 3) get_authorization_folio_status: membership check
CREATE OR REPLACE FUNCTION public.get_authorization_folio_status(_authorization_id bigint)
RETURNS TABLE(authorized integer, used integer, adjustment integer, available integer, is_low boolean, is_overdrawn boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _auth record;
  _used integer;
  _uid uuid := auth.uid();
BEGIN
  SELECT authorized_folios, manual_adjustment, enterprise_id INTO _auth
  FROM tab_book_authorizations WHERE id = _authorization_id;

  IF _auth IS NULL THEN
    RETURN;
  END IF;

  IF _uid IS NOT NULL AND NOT (
    public.is_super_admin(_uid) OR public.user_is_linked_to_enterprise(_uid, _auth.enterprise_id)
  ) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(pages_used), 0)::integer INTO _used
  FROM tab_book_folio_consumption WHERE authorization_id = _authorization_id;

  authorized := _auth.authorized_folios;
  used := _used + _auth.manual_adjustment;
  adjustment := _auth.manual_adjustment;
  available := _auth.authorized_folios - used;
  is_low := available > 0 AND available <= 10;
  is_overdrawn := available < 0;
  RETURN NEXT;
END;
$function$;

-- 4) reverse_fx_revaluation: membership check right after loading the run
CREATE OR REPLACE FUNCTION public.reverse_fx_revaluation(p_run_id bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_run RECORD;
  v_orig_entry RECORD;
  v_reverse_date date;
  v_reverse_year int;
  v_reverse_month int;
  v_period_id bigint;
  v_period_status text;
  v_next_number int;
  v_entry_number text;
  v_new_entry_id bigint;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_run FROM tab_fx_revaluation_runs WHERE id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Corrida de revaluación % no encontrada', p_run_id;
  END IF;

  IF v_uid IS NOT NULL AND NOT (
    public.is_super_admin(v_uid) OR public.user_is_linked_to_enterprise(v_uid, v_run.enterprise_id)
  ) THEN
    RAISE EXCEPTION 'No tiene acceso a esta empresa' USING ERRCODE = '42501';
  END IF;

  IF v_run.revaluation_type <> 'UNREALIZED' THEN
    RAISE EXCEPTION 'Solo se pueden reversar revaluaciones NO realizadas (UNREALIZED)';
  END IF;
  IF v_run.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta revaluación ya fue reversada (%)', v_run.reversed_at;
  END IF;
  IF v_run.journal_entry_id IS NULL THEN
    RAISE EXCEPTION 'La corrida no tiene partida contable asociada';
  END IF;

  SELECT * INTO v_orig_entry FROM tab_journal_entries WHERE id = v_run.journal_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida original % no encontrada', v_run.journal_entry_id;
  END IF;

  v_reverse_date := (date_trunc('month', v_run.cutoff_date::date) + interval '1 month')::date;
  v_reverse_year := extract(year from v_reverse_date)::int;
  v_reverse_month := extract(month from v_reverse_date)::int;

  SELECT id, status INTO v_period_id, v_period_status
  FROM tab_accounting_periods
  WHERE enterprise_id = v_run.enterprise_id
    AND start_date <= v_reverse_date AND end_date >= v_reverse_date
  LIMIT 1;

  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'No existe un período contable que contenga la fecha de reverso %. Crea el período del mes siguiente.', v_reverse_date;
  END IF;
  IF v_period_status = 'cerrado' THEN
    RAISE EXCEPTION 'El período del mes siguiente está cerrado. Reábrelo para registrar el reverso.';
  END IF;

  INSERT INTO journal_entry_counters (enterprise_id, year, month, prefix, last_number)
  VALUES (v_run.enterprise_id, v_reverse_year, v_reverse_month, 'DIFC', 1)
  ON CONFLICT (enterprise_id, year, month, prefix)
  DO UPDATE SET last_number = journal_entry_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next_number;

  v_entry_number := 'DIFC-' || v_reverse_year || '-' || lpad(v_reverse_month::text, 2, '0') || '-' || lpad(v_next_number::text, 4, '0');

  INSERT INTO tab_journal_entries (
    enterprise_id, accounting_period_id, entry_number, entry_date,
    entry_type, description, status, currency_code, exchange_rate,
    total_debit, total_credit, reversal_entry_id
  ) VALUES (
    v_run.enterprise_id, v_period_id, v_entry_number, v_reverse_date,
    'ajuste',
    'Reverso revaluación cambiaria NO realizada - corte ' || to_char(v_run.cutoff_date::date, 'YYYY-MM-DD') || ' (partida origen ' || v_orig_entry.entry_number || ')',
    'borrador', v_orig_entry.currency_code, COALESCE(v_orig_entry.exchange_rate, 1),
    0, 0, v_orig_entry.id
  ) RETURNING id INTO v_new_entry_id;

  INSERT INTO tab_journal_entry_details (
    journal_entry_id, line_number, account_id, debit_amount, credit_amount, description
  )
  SELECT v_new_entry_id, line_number, account_id, credit_amount, debit_amount,
         'Reverso: ' || COALESCE(description, '')
  FROM tab_journal_entry_details
  WHERE journal_entry_id = v_orig_entry.id
  ORDER BY line_number;

  SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
  INTO v_total_debit, v_total_credit
  FROM tab_journal_entry_details WHERE journal_entry_id = v_new_entry_id;

  UPDATE tab_journal_entries
  SET status = 'contabilizada', is_posted = true, posted_at = now(),
      total_debit = v_total_debit, total_credit = v_total_credit
  WHERE id = v_new_entry_id;

  UPDATE tab_fx_revaluation_runs SET reversed_at = now() WHERE id = p_run_id;
  UPDATE tab_journal_entries SET reversed_by_entry_id = v_new_entry_id WHERE id = v_orig_entry.id;

  RETURN v_new_entry_id;
END;
$function$;

-- 5) Journal entries: block direct mutation of posted entries via the Data API
DROP POLICY IF EXISTS "enterprise_journal_policy" ON public.tab_journal_entries;

CREATE POLICY "journal_select_member" ON public.tab_journal_entries
FOR SELECT USING (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()));

CREATE POLICY "journal_insert_member" ON public.tab_journal_entries
FOR INSERT WITH CHECK (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()));

CREATE POLICY "journal_update_unposted" ON public.tab_journal_entries
FOR UPDATE
USING (
  enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
  AND COALESCE(is_posted, false) = false
)
WITH CHECK (enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()));

CREATE POLICY "journal_delete_unposted" ON public.tab_journal_entries
FOR DELETE USING (
  enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
  AND COALESCE(is_posted, false) = false
);

DROP POLICY IF EXISTS "journal_details_policy" ON public.tab_journal_entry_details;

CREATE POLICY "journal_details_select_member" ON public.tab_journal_entry_details
FOR SELECT USING (
  journal_entry_id IN (
    SELECT id FROM public.tab_journal_entries
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
  )
);

CREATE POLICY "journal_details_insert_unposted" ON public.tab_journal_entry_details
FOR INSERT WITH CHECK (
  journal_entry_id IN (
    SELECT id FROM public.tab_journal_entries
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
      AND COALESCE(is_posted, false) = false
  )
);

CREATE POLICY "journal_details_update_unposted" ON public.tab_journal_entry_details
FOR UPDATE USING (
  journal_entry_id IN (
    SELECT id FROM public.tab_journal_entries
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
      AND COALESCE(is_posted, false) = false
  )
) WITH CHECK (
  journal_entry_id IN (
    SELECT id FROM public.tab_journal_entries
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
      AND COALESCE(is_posted, false) = false
  )
);

CREATE POLICY "journal_details_delete_unposted" ON public.tab_journal_entry_details
FOR DELETE USING (
  journal_entry_id IN (
    SELECT id FROM public.tab_journal_entries
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
      AND COALESCE(is_posted, false) = false
  )
);

-- 6) Collections: protect payments already tied to a journal entry; deletes restricted to admins
DROP POLICY IF EXISTS "enterprise collection payments" ON public.tab_collection_payments;

CREATE POLICY "collection_payments_select" ON public.tab_collection_payments
FOR SELECT TO authenticated USING (
  tracking_id IN (SELECT id FROM public.tab_collection_tracking
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
);

CREATE POLICY "collection_payments_insert" ON public.tab_collection_payments
FOR INSERT TO authenticated WITH CHECK (
  tracking_id IN (SELECT id FROM public.tab_collection_tracking
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
);

CREATE POLICY "collection_payments_update_unposted" ON public.tab_collection_payments
FOR UPDATE TO authenticated USING (
  journal_entry_id IS NULL
  AND tracking_id IN (SELECT id FROM public.tab_collection_tracking
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
) WITH CHECK (
  tracking_id IN (SELECT id FROM public.tab_collection_tracking
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
);

CREATE POLICY "collection_payments_delete_unposted" ON public.tab_collection_payments
FOR DELETE TO authenticated USING (
  journal_entry_id IS NULL
  AND tracking_id IN (SELECT id FROM public.tab_collection_tracking
    WHERE enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()))
);

DROP POLICY IF EXISTS "enterprise collection tracking" ON public.tab_collection_tracking;

CREATE POLICY "collection_tracking_select" ON public.tab_collection_tracking
FOR SELECT TO authenticated USING (
  enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
);

CREATE POLICY "collection_tracking_insert" ON public.tab_collection_tracking
FOR INSERT TO authenticated WITH CHECK (
  enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
);

CREATE POLICY "collection_tracking_update" ON public.tab_collection_tracking
FOR UPDATE TO authenticated USING (
  enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
) WITH CHECK (
  enterprise_id IN (SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid())
);

CREATE POLICY "collection_tracking_delete_admin" ON public.tab_collection_tracking
FOR DELETE TO authenticated USING (
  public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);

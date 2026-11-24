-- Cierre de funciones con privilegios elevados que cualquier usuario autenticado podía invocar con el ID de otra empresa.

-- 1) Importación y borrado de legado: solo el rol de servicio.
--    La función de servidor legacy-import-runner ya exige ser super administrador o administrador de la firma;
--    estas funciones no deben poder invocarse directamente por usuarios autenticados.
REVOKE ALL ON FUNCTION public.bulk_insert_accounts(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_accounts(bigint, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.clear_legacy_import_batch(bigint, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_legacy_import_batch(bigint, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.clear_legacy_import_block(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_legacy_import_block(bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.hard_reset_legacy_import_enterprise(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hard_reset_legacy_import_enterprise(bigint) TO service_role;
REVOKE ALL ON FUNCTION public.hard_reset_legacy_import_phase(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hard_reset_legacy_import_phase(bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.reset_legacy_import_data(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_legacy_import_data(bigint) TO service_role;

-- 2) Generar cronograma de depreciación: validar que quien llama puede operar sobre la empresa del activo
CREATE OR REPLACE FUNCTION public.generate_asset_depreciation_schedule(p_asset_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_asset           public.fixed_assets%ROWTYPE;
  v_policy          public.fixed_asset_policy%ROWTYPE;
  v_monthly_dep     NUMERIC(18,2);
  v_depreciable     NUMERIC(18,2);
  v_start_date      DATE;
  v_current_date    DATE;
  v_accum           NUMERIC(18,2) := 0;
  v_nbv             NUMERIC(18,2);
  v_month_count     INT := 0;
BEGIN
  -- Load asset
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  -- Mismo mensaje si no existe o no hay permiso (no revela qué activos existen)
  IF NOT FOUND
     OR (auth.role() IS DISTINCT FROM 'service_role' AND NOT public.can_write_fixed_assets(v_asset.enterprise_id)) THEN
    RAISE EXCEPTION 'No autorizado o activo no encontrado' USING ERRCODE = '42501';
  END IF;

  -- Load policy
  SELECT * INTO v_policy FROM public.fixed_asset_policy WHERE enterprise_id = v_asset.enterprise_id;

  -- Determine start date
  v_start_date := COALESCE(
    CASE WHEN v_policy.depreciation_start_rule = 'IN_SERVICE_DATE' THEN v_asset.in_service_date ELSE NULL END,
    v_asset.acquisition_date
  );

  -- Depreciable amount
  v_depreciable := v_asset.acquisition_cost - v_asset.residual_value;
  IF v_depreciable <= 0 THEN RETURN; END IF;

  -- Monthly depreciation (straight-line)
  v_monthly_dep := ROUND(v_depreciable / v_asset.useful_life_months, 2);

  -- Delete existing PLANNED rows (keep POSTED)
  DELETE FROM public.fixed_asset_depreciation_schedule
  WHERE asset_id = p_asset_id AND status = 'PLANNED';

  -- Generate schedule rows
  v_current_date := DATE_TRUNC('month', v_start_date);

  FOR i IN 1..v_asset.useful_life_months LOOP
    -- Last month: adjust for rounding
    IF i = v_asset.useful_life_months THEN
      v_monthly_dep := v_depreciable - v_accum;
    END IF;

    v_accum := v_accum + v_monthly_dep;
    v_nbv   := v_asset.acquisition_cost - v_accum;

    -- Only insert if not already POSTED
    IF NOT EXISTS (
      SELECT 1 FROM public.fixed_asset_depreciation_schedule
      WHERE asset_id = p_asset_id
        AND year  = EXTRACT(YEAR FROM v_current_date)
        AND month = EXTRACT(MONTH FROM v_current_date)
        AND status = 'POSTED'
    ) THEN
      INSERT INTO public.fixed_asset_depreciation_schedule
        (asset_id, enterprise_id, year, month, planned_depreciation_amount, accumulated_depreciation, net_book_value, status)
      VALUES (
        p_asset_id, v_asset.enterprise_id,
        EXTRACT(YEAR FROM v_current_date), EXTRACT(MONTH FROM v_current_date),
        v_monthly_dep, v_accum, v_nbv, 'PLANNED'
      )
      ON CONFLICT (asset_id, year, month) DO UPDATE SET
        planned_depreciation_amount = EXCLUDED.planned_depreciation_amount,
        accumulated_depreciation    = EXCLUDED.accumulated_depreciation,
        net_book_value              = EXCLUDED.net_book_value;
    END IF;

    v_current_date := v_current_date + INTERVAL '1 month';
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.generate_asset_depreciation_schedule(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_asset_depreciation_schedule(bigint) TO authenticated, service_role;

-- 3) Saldo en moneda extranjera: solo de cuentas de empresas a las que el usuario tiene acceso (si no, devuelve 0)
CREATE OR REPLACE FUNCTION public.get_account_fx_balance(_account_id bigint, _currency_code text, _cutoff_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(
    COALESCE(d.original_debit, d.debit_amount, 0)
    - COALESCE(d.original_credit, d.credit_amount, 0)
  ), 0)
  FROM public.tab_journal_entry_details d
  JOIN public.tab_journal_entries j ON j.id = d.journal_entry_id
  JOIN public.tab_accounts a ON a.id = d.account_id
  WHERE d.account_id = _account_id
    AND (auth.role() = 'service_role'
         OR public.is_super_admin(auth.uid())
         OR public.user_is_linked_to_enterprise(auth.uid(), a.enterprise_id))
    AND j.entry_date <= _cutoff_date
    AND j.status = 'contabilizada'
    AND COALESCE(d.currency_code, j.currency_code, 'GTQ') = _currency_code;
$function$;
REVOKE ALL ON FUNCTION public.get_account_fx_balance(bigint, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_account_fx_balance(bigint, text, date) TO authenticated, service_role;

-- 4) Las funciones de permisos de activos no necesitan ser ejecutables sin sesión
REVOKE ALL ON FUNCTION public.can_write_fixed_assets(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_fixed_assets(bigint) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_fixed_asset_valuation(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_fixed_asset_valuation(bigint) TO authenticated, service_role;

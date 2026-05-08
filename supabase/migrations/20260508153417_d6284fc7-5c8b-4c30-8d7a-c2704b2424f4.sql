
CREATE OR REPLACE FUNCTION public.get_dashboard_kpis(
  p_enterprise_id bigint,
  p_start_date    date,
  p_end_date      date,
  p_prev_start    date,
  p_prev_end      date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_curr    jsonb;
  v_prev    jsonb;
  v_profit  numeric;
  v_pprofit numeric;
BEGIN
  SELECT public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tab_user_enterprises ue
    WHERE ue.user_id = auth.uid() AND ue.enterprise_id = p_enterprise_id
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'access denied to enterprise %', p_enterprise_id USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_curr
    FROM public.get_account_balances_by_period(p_enterprise_id, p_end_date) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_prev
    FROM public.get_account_balances_by_period(p_enterprise_id, p_prev_end) t;

  v_profit  := public.get_period_profit(p_enterprise_id, p_start_date, p_end_date);
  v_pprofit := public.get_period_profit(p_enterprise_id, p_prev_start, p_prev_end);

  RETURN jsonb_build_object(
    'current_balances',  v_curr,
    'previous_balances', v_prev,
    'current_profit',    COALESCE(v_profit, 0),
    'previous_profit',   COALESCE(v_pprofit, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_kpis(bigint, date, date, date, date) TO authenticated;


-- Phase 3: Collection settings + business-day adjustment
CREATE TABLE public.tab_collection_settings (
  id BIGSERIAL PRIMARY KEY,
  enterprise_id BIGINT NOT NULL UNIQUE,
  adjust_to_business_days BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tab_collection_settings TO authenticated;
GRANT ALL ON public.tab_collection_settings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tab_collection_settings_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.tab_collection_settings_id_seq TO service_role;

ALTER TABLE public.tab_collection_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enterprise collection settings" ON public.tab_collection_settings
FOR ALL TO authenticated
USING (enterprise_id IN (SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()))
WITH CHECK (enterprise_id IN (SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()));

CREATE TRIGGER update_tab_collection_settings_updated_at
BEFORE UPDATE ON public.tab_collection_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend calculate_due_date to skip weekends and holidays when enabled
CREATE OR REPLACE FUNCTION public.calculate_due_date(p_enterprise_id bigint, p_issue_date date, p_term_days integer)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_date date := p_issue_date + p_term_days;
  v_adjust boolean := false;
  v_dow int;
  v_is_holiday boolean;
  v_guard int := 0;
BEGIN
  SELECT adjust_to_business_days INTO v_adjust
  FROM tab_collection_settings WHERE enterprise_id = p_enterprise_id;

  IF NOT COALESCE(v_adjust, false) THEN
    RETURN v_date;
  END IF;

  LOOP
    v_guard := v_guard + 1;
    EXIT WHEN v_guard > 30;

    v_dow := EXTRACT(ISODOW FROM v_date); -- 6=Sat 7=Sun
    IF v_dow >= 6 THEN
      v_date := v_date + 1;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM tab_holidays h
      WHERE (h.enterprise_id = p_enterprise_id OR h.enterprise_id IS NULL)
        AND (
          h.holiday_date = v_date
          OR (COALESCE(h.is_recurring, false) = true
              AND EXTRACT(MONTH FROM h.holiday_date) = EXTRACT(MONTH FROM v_date)
              AND EXTRACT(DAY FROM h.holiday_date) = EXTRACT(DAY FROM v_date))
        )
    ) INTO v_is_holiday;

    IF v_is_holiday THEN
      v_date := v_date + 1;
      CONTINUE;
    END IF;

    EXIT;
  END LOOP;

  RETURN v_date;
END;
$function$;

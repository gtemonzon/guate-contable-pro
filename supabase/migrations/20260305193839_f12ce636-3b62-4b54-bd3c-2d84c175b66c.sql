
-- Step 1: Add month column and change PK
ALTER TABLE public.journal_entry_counters ADD COLUMN month int NOT NULL DEFAULT 1;
ALTER TABLE public.journal_entry_counters DROP CONSTRAINT journal_entry_counters_pkey;
ALTER TABLE public.journal_entry_counters ADD PRIMARY KEY (enterprise_id, prefix, year, month);

-- Step 2: Disable user triggers for renumbering
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER audit_journal_entries;
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_audit_journal_entries;
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_enforce_balanced_on_insert;
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_enforce_balanced_on_post;
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_enforce_open_period_on_post;
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_journal_entry_history;
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_journal_entry_immutability;

-- Step 3: Renumber
DO $$
DECLARE
  rec RECORD;
  v_seq INT;
  v_prev_key TEXT := '';
  v_new_number TEXT;
  v_key TEXT;
BEGIN
  v_seq := 0;
  FOR rec IN
    SELECT je.id, je.entry_date, je.enterprise_id,
      (regexp_match(je.entry_number, '^([A-Z]+)-'))[1] AS prefix,
      EXTRACT(YEAR FROM je.entry_date)::INT AS yr,
      EXTRACT(MONTH FROM je.entry_date)::INT AS mo
    FROM public.tab_journal_entries je
    WHERE je.deleted_at IS NULL
      AND je.entry_number NOT LIKE 'REV-%'
      AND je.entry_number NOT LIKE 'DRAFT-%'
      AND je.entry_number ~ '^[A-Z]+-\d'
    ORDER BY je.enterprise_id,
             (regexp_match(je.entry_number, '^([A-Z]+)-'))[1],
             EXTRACT(YEAR FROM je.entry_date),
             EXTRACT(MONTH FROM je.entry_date),
             je.entry_date, je.id
  LOOP
    IF rec.prefix IS NULL THEN CONTINUE; END IF;
    v_key := rec.enterprise_id || '|' || rec.prefix || '|' || rec.yr || '|' || rec.mo;
    IF v_key != v_prev_key THEN v_seq := 0; v_prev_key := v_key; END IF;
    v_seq := v_seq + 1;
    v_new_number := rec.prefix || '-' || rec.yr::TEXT || '-' || lpad(rec.mo::TEXT, 2, '0') || '-' || lpad(v_seq::TEXT, 4, '0');
    UPDATE public.tab_journal_entries SET entry_number = v_new_number WHERE id = rec.id;
  END LOOP;
END $$;

-- Step 4: Re-enable triggers
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER audit_journal_entries;
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_audit_journal_entries;
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_enforce_balanced_on_insert;
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_enforce_balanced_on_post;
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_enforce_open_period_on_post;
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_journal_entry_history;
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_journal_entry_immutability;

-- Step 5: Rebuild counters
DELETE FROM public.journal_entry_counters;
INSERT INTO public.journal_entry_counters (enterprise_id, prefix, year, month, last_number, updated_at)
SELECT je.enterprise_id,
  (regexp_match(je.entry_number, '^([A-Z]+)-\d{4}-\d{2}-\d+$'))[1],
  EXTRACT(YEAR FROM je.entry_date)::INT,
  EXTRACT(MONTH FROM je.entry_date)::INT,
  MAX((regexp_match(je.entry_number, '-(\d+)$'))[1]::INT),
  now()
FROM public.tab_journal_entries je
WHERE je.deleted_at IS NULL AND je.entry_number ~ '^[A-Z]+-\d{4}-\d{2}-\d+$'
GROUP BY je.enterprise_id,
  (regexp_match(je.entry_number, '^([A-Z]+)-\d{4}-\d{2}-\d+$'))[1],
  EXTRACT(YEAR FROM je.entry_date)::INT,
  EXTRACT(MONTH FROM je.entry_date)::INT;

-- Step 6: Update RPCs
CREATE OR REPLACE FUNCTION public.allocate_journal_entry_number(p_enterprise_id bigint, p_entry_type text, p_entry_date date)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix_code text; v_prefix text; v_year int; v_month int; v_next_number int;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');
  SELECT prefix INTO v_prefix FROM public.tab_journal_entry_prefixes WHERE code = v_prefix_code AND is_active = true LIMIT 1;
  v_prefix := COALESCE(v_prefix, 'PART');
  v_year := EXTRACT(YEAR FROM p_entry_date)::int;
  v_month := EXTRACT(MONTH FROM p_entry_date)::int;
  INSERT INTO public.journal_entry_counters (enterprise_id, prefix, year, month, last_number, updated_at)
  VALUES (p_enterprise_id, v_prefix, v_year, v_month, 1, now())
  ON CONFLICT (enterprise_id, prefix, year, month)
  DO UPDATE SET last_number = journal_entry_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next_number;
  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_month::text, 2, '0') || '-' || lpad(v_next_number::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.preview_next_entry_number(p_enterprise_id bigint, p_entry_type text, p_entry_date date)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix_code text; v_prefix text; v_year int; v_month int; v_current_number int; v_next_number int;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');
  SELECT prefix INTO v_prefix FROM public.tab_journal_entry_prefixes WHERE code = v_prefix_code AND is_active = true LIMIT 1;
  v_prefix := COALESCE(v_prefix, 'PART');
  v_year := EXTRACT(YEAR FROM p_entry_date)::int;
  v_month := EXTRACT(MONTH FROM p_entry_date)::int;
  SELECT last_number INTO v_current_number FROM public.journal_entry_counters
  WHERE enterprise_id = p_enterprise_id AND prefix = v_prefix AND year = v_year AND month = v_month;
  v_next_number := COALESCE(v_current_number, 0) + 1;
  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_month::text, 2, '0') || '-' || lpad(v_next_number::text, 4, '0');
END;
$function$;

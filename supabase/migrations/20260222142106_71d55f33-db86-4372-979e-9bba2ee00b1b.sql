
-- ============================================================
-- Atomic journal entry numbering: counter table + RPC
-- ============================================================

-- 1) Counter table
CREATE TABLE IF NOT EXISTS public.journal_entry_counters (
  enterprise_id bigint NOT NULL,
  prefix text NOT NULL,
  year int NOT NULL,
  last_number int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (enterprise_id, prefix, year)
);

-- RLS: only linked users can read/write their enterprise counters
ALTER TABLE public.journal_entry_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage counters for their enterprises"
  ON public.journal_entry_counters
  FOR ALL
  USING (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
  ))
  WITH CHECK (enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
  ));

-- 2) Seed counters from existing data so we don't restart from 0
INSERT INTO public.journal_entry_counters (enterprise_id, prefix, year, last_number, updated_at)
SELECT 
  je.enterprise_id,
  split_part(je.entry_number, '-', 1) AS prefix,
  split_part(je.entry_number, '-', 2)::int AS year,
  MAX(split_part(je.entry_number, '-', 3)::int) AS last_number,
  now()
FROM public.tab_journal_entries je
WHERE je.deleted_at IS NULL
  AND je.entry_number ~ '^[A-Z]+-\d{4}-\d+$'
GROUP BY je.enterprise_id, split_part(je.entry_number, '-', 1), split_part(je.entry_number, '-', 2)::int
ON CONFLICT (enterprise_id, prefix, year) DO UPDATE
  SET last_number = GREATEST(journal_entry_counters.last_number, EXCLUDED.last_number);

-- 3) Atomic allocator RPC function
CREATE OR REPLACE FUNCTION public.allocate_journal_entry_number(
  p_enterprise_id bigint,
  p_entry_type text,
  p_entry_date date
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix_code text;
  v_prefix text;
  v_year int;
  v_next_number int;
  v_entry_number text;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  -- Resolve prefix code from entry_type
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');

  -- Look up the actual prefix string
  SELECT prefix INTO v_prefix
  FROM public.tab_journal_entry_prefixes
  WHERE code = v_prefix_code AND is_active = true
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, 'PART');
  v_year := EXTRACT(YEAR FROM p_entry_date)::int;

  -- Upsert + lock the counter row atomically
  INSERT INTO public.journal_entry_counters (enterprise_id, prefix, year, last_number, updated_at)
  VALUES (p_enterprise_id, v_prefix, v_year, 1, now())
  ON CONFLICT (enterprise_id, prefix, year)
  DO UPDATE SET
    last_number = journal_entry_counters.last_number + 1,
    updated_at = now()
  RETURNING last_number INTO v_next_number;

  -- Format: PREFIX-YYYY-### (3-digit padding for < 1000)
  IF v_next_number < 1000 THEN
    v_entry_number := v_prefix || '-' || v_year::text || '-' || lpad(v_next_number::text, 3, '0');
  ELSE
    v_entry_number := v_prefix || '-' || v_year::text || '-' || v_next_number::text;
  END IF;

  RETURN v_entry_number;
END;
$$;

-- 4) Preview function (doesn't allocate, just shows what next number would be)
CREATE OR REPLACE FUNCTION public.preview_next_entry_number(
  p_enterprise_id bigint,
  p_entry_type text,
  p_entry_date date
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix_code text;
  v_prefix text;
  v_year int;
  v_current_number int;
  v_next_number int;
  v_entry_number text;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');

  SELECT prefix INTO v_prefix
  FROM public.tab_journal_entry_prefixes
  WHERE code = v_prefix_code AND is_active = true
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, 'PART');
  v_year := EXTRACT(YEAR FROM p_entry_date)::int;

  SELECT last_number INTO v_current_number
  FROM public.journal_entry_counters
  WHERE enterprise_id = p_enterprise_id AND prefix = v_prefix AND year = v_year;

  v_next_number := COALESCE(v_current_number, 0) + 1;

  IF v_next_number < 1000 THEN
    v_entry_number := v_prefix || '-' || v_year::text || '-' || lpad(v_next_number::text, 3, '0');
  ELSE
    v_entry_number := v_prefix || '-' || v_year::text || '-' || v_next_number::text;
  END IF;

  RETURN v_entry_number;
END;
$$;

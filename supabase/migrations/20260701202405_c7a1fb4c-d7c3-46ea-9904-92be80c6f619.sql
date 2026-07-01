
-- Activar modo importación para bypass del trigger de inmutabilidad durante el renombrado
SET LOCAL app.import_mode = 'on';

-- 1) RENOMBRAR PARTIDAS HUÉRFANAS (PREF-YYYY-MM -> PREF-YYYY-MM-####)
WITH orphans AS (
  SELECT je.id,
         je.enterprise_id,
         split_part(je.entry_number,'-',1) AS prefix,
         (split_part(je.entry_number,'-',2))::int AS y,
         (split_part(je.entry_number,'-',3))::int AS m
  FROM public.tab_journal_entries je
  WHERE je.entry_number ~ '^(VENT|COMP|PART|AJUS|APER|CIER|REV|DIFC|DEP|DEPR|COGS|CSTV|TRAS)-\d{4}-\d{2}$'
),
current_max AS (
  SELECT je.enterprise_id,
         (split_part(je.entry_number,'-',2))::int AS y,
         (split_part(je.entry_number,'-',3))::int AS m,
         MAX((split_part(je.entry_number,'-',4))::int) AS max_seq
  FROM public.tab_journal_entries je
  WHERE je.entry_number ~ '^[A-Z]+-\d{4}-\d{2}-\d+$'
  GROUP BY 1,2,3
),
numbered AS (
  SELECT o.id, o.enterprise_id, o.prefix, o.y, o.m,
         COALESCE(cm.max_seq, 0)
           + ROW_NUMBER() OVER (PARTITION BY o.enterprise_id, o.y, o.m ORDER BY o.id) AS new_seq
  FROM orphans o
  LEFT JOIN current_max cm
    ON cm.enterprise_id = o.enterprise_id AND cm.y = o.y AND cm.m = o.m
)
UPDATE public.tab_journal_entries je
   SET entry_number = n.prefix || '-' || n.y || '-' || lpad(n.m::text,2,'0') || '-' || lpad(n.new_seq::text,4,'0')
  FROM numbered n
 WHERE je.id = n.id;

-- 2) SEMBRAR CONTADOR COMPARTIDO (prefix = 'ALL')
INSERT INTO public.journal_entry_counters (enterprise_id, prefix, year, month, last_number, updated_at)
SELECT je.enterprise_id,
       'ALL' AS prefix,
       (split_part(je.entry_number,'-',2))::int AS year,
       (split_part(je.entry_number,'-',3))::int AS month,
       MAX((split_part(je.entry_number,'-',4))::int) AS last_number,
       now()
FROM public.tab_journal_entries je
WHERE je.entry_number ~ '^[A-Z]+-\d{4}-\d{2}-\d+$'
GROUP BY je.enterprise_id, year, month
ON CONFLICT (enterprise_id, prefix, year, month)
DO UPDATE SET last_number = GREATEST(journal_entry_counters.last_number, EXCLUDED.last_number),
              updated_at = now();

-- 3) NUEVAS RPCs: correlativo mensual compartido por empresa
CREATE OR REPLACE FUNCTION public.allocate_journal_entry_number(
  p_enterprise_id bigint, p_entry_type text, p_entry_date date
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix_code text; v_prefix text; v_year int; v_month int; v_next_number int;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');
  SELECT prefix INTO v_prefix
    FROM public.tab_journal_entry_prefixes
   WHERE code = v_prefix_code AND is_active = true LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.preview_next_entry_number(
  p_enterprise_id bigint, p_entry_type text, p_entry_date date
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix_code text; v_prefix text; v_year int; v_month int; v_current_number int; v_next_number int;
  v_type_map jsonb := '{"diario":"MANUAL","apertura":"OPENING","cierre":"CLOSING","ajuste":"ADJUSTMENT","compras":"PURCHASES","ventas":"SALES"}'::jsonb;
BEGIN
  v_prefix_code := COALESCE(v_type_map ->> p_entry_type, 'MANUAL');
  SELECT prefix INTO v_prefix
    FROM public.tab_journal_entry_prefixes
   WHERE code = v_prefix_code AND is_active = true LIMIT 1;
  v_prefix := COALESCE(v_prefix, 'PART');
  v_year := EXTRACT(YEAR FROM p_entry_date)::int;
  v_month := EXTRACT(MONTH FROM p_entry_date)::int;

  SELECT last_number INTO v_current_number
    FROM public.journal_entry_counters
   WHERE enterprise_id = p_enterprise_id AND prefix = 'ALL' AND year = v_year AND month = v_month;

  v_next_number := COALESCE(v_current_number, 0) + 1;
  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_month::text,2,'0') || '-' || lpad(v_next_number::text,4,'0');
END;
$function$;

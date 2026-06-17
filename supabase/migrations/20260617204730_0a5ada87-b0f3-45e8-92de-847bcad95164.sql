BEGIN;

ALTER TABLE public.tab_journal_entries DISABLE TRIGGER USER;

WITH normalized AS (
  SELECT je.id,
    CASE 
      WHEN entry_number ~ '^\d{4}-\d{2}-\d{5}$' 
        THEN 'PART-' || substring(entry_number,1,7) || '-' || lpad((substring(entry_number,9,5))::int::text,3,'0')
      WHEN entry_number ~ '^[A-Z]+-\d{4}-\d{2}-\d{4}$' 
        THEN substring(entry_number,1,position('-' in entry_number)-1) || '-' 
             || substring(entry_number, position('-' in entry_number)+1, 7) || '-' 
             || lpad(split_part(entry_number,'-',4)::int::text,3,'0')
      WHEN entry_number ~ '^[A-Z]+-\d{4}-\d{2}$' 
        THEN entry_number || '-001'
    END AS new_number
  FROM public.tab_journal_entries je
  JOIN public.tab_enterprises e ON e.id = je.enterprise_id
  WHERE e.tenant_id = 2
    AND je.entry_number !~ '^[A-Z]+-\d{4}-\d{2}-\d{3}$'
    AND je.id NOT IN (18909, 19452)
)
UPDATE public.tab_journal_entries je
SET entry_number = n.new_number
FROM normalized n
WHERE je.id = n.id
  AND je.entry_number <> n.new_number;

ALTER TABLE public.tab_journal_entries ENABLE TRIGGER USER;

COMMIT;
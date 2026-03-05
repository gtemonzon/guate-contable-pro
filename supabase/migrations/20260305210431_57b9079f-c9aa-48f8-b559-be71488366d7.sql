
-- Fix the incorrectly numbered entry VENT-2021-03 to proper format
-- First find it and renumber it

-- Disable immutability trigger temporarily
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_journal_entry_immutability;

-- Determine the next available VENT number for enterprise 14, year 2021, month 03
-- and rename VENT-2021-03 to VENT-2021-03-0001 (or next available)
UPDATE public.tab_journal_entries
SET entry_number = 'VENT-2021-03-0001'
WHERE entry_number = 'VENT-2021-03'
  AND NOT EXISTS (
    SELECT 1 FROM public.tab_journal_entries e2 
    WHERE e2.entry_number = 'VENT-2021-03-0001' 
      AND e2.enterprise_id = tab_journal_entries.enterprise_id
  );

-- If VENT-2021-03-0001 already exists, try 0002
UPDATE public.tab_journal_entries
SET entry_number = 'VENT-2021-03-0002'
WHERE entry_number = 'VENT-2021-03'
  AND NOT EXISTS (
    SELECT 1 FROM public.tab_journal_entries e2 
    WHERE e2.entry_number = 'VENT-2021-03-0002' 
      AND e2.enterprise_id = tab_journal_entries.enterprise_id
  );

-- Update the counter for VENT prefix if needed
INSERT INTO public.journal_entry_counters (enterprise_id, prefix, year, month, last_number)
SELECT je.enterprise_id, 'VENT', 2021, 3, 1
FROM public.tab_journal_entries je
WHERE je.entry_number = 'VENT-2021-03-0001'
ON CONFLICT (enterprise_id, prefix, year, month)
DO UPDATE SET last_number = GREATEST(journal_entry_counters.last_number, 1);

-- Re-enable trigger
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_journal_entry_immutability;

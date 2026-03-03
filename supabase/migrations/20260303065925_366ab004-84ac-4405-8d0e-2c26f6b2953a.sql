-- Temporarily disable the immutability trigger to fix the date
ALTER TABLE public.tab_journal_entries DISABLE TRIGGER trg_journal_entry_immutability;

-- Fix the date of VENT-2021-02 (entry id 195) to the correct date
UPDATE public.tab_journal_entries SET entry_date = '2021-02-28' WHERE id = 195;

-- Re-enable the trigger
ALTER TABLE public.tab_journal_entries ENABLE TRIGGER trg_journal_entry_immutability;
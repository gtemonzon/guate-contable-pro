
-- Add column to link an original entry to its reversal entry
ALTER TABLE public.tab_journal_entries
  ADD COLUMN IF NOT EXISTS reversal_entry_id bigint REFERENCES public.tab_journal_entries(id);

-- Add column to link a reversal entry back to the original
ALTER TABLE public.tab_journal_entries
  ADD COLUMN IF NOT EXISTS reversed_by_entry_id bigint REFERENCES public.tab_journal_entries(id);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversal_entry_id ON public.tab_journal_entries(reversal_entry_id) WHERE reversal_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversed_by_entry_id ON public.tab_journal_entries(reversed_by_entry_id) WHERE reversed_by_entry_id IS NOT NULL;

COMMENT ON COLUMN public.tab_journal_entries.reversal_entry_id IS 'Points to the REV- entry that reverses this original entry';
COMMENT ON COLUMN public.tab_journal_entries.reversed_by_entry_id IS 'Points back to the original entry that this REV- reverses';

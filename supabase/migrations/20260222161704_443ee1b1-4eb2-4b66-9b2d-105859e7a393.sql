-- Add structured source tracking to journal entry detail lines
-- Allows linking lines to their origin (e.g. purchase import) without relying on description strings.

ALTER TABLE public.tab_journal_entry_details
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_id   bigint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source_ref  text DEFAULT NULL;

-- Index for fast lookup of lines by source
CREATE INDEX IF NOT EXISTS idx_jed_source
  ON public.tab_journal_entry_details (source_type, source_id)
  WHERE source_type IS NOT NULL;

COMMENT ON COLUMN public.tab_journal_entry_details.source_type IS 'Origin module: PURCHASE, DEPRECIATION, DISPOSAL, etc.';
COMMENT ON COLUMN public.tab_journal_entry_details.source_id   IS 'FK-like ref to the originating record (e.g. purchase_ledger.id)';
COMMENT ON COLUMN public.tab_journal_entry_details.source_ref  IS 'Human-readable ref (e.g. invoice number) for display';
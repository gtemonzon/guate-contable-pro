UPDATE public.tab_journal_entries
SET status = 'contabilizado'
WHERE is_posted = true
  AND deleted_at IS NULL
  AND COALESCE(status, 'borrador') <> 'contabilizado';
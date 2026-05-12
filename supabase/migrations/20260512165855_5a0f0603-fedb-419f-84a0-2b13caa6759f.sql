DO $$
BEGIN
  PERFORM set_config('app.import_mode', 'on', true);
  UPDATE public.tab_journal_entries SET entry_type = 'diario' WHERE id = 15703 AND entry_number = '2025-12-00010';
END $$;
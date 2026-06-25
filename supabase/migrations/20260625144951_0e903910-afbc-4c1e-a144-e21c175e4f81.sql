DO $$
BEGIN
  PERFORM set_config('app.import_mode', 'on', true);
  UPDATE public.tab_journal_entries
  SET entry_type = 'apertura'
  WHERE id IN (4391, 4448, 4503, 4615, 4669, 4723, 4775, 4828, 4881, 24307)
    AND entry_type = 'diario';
END $$;
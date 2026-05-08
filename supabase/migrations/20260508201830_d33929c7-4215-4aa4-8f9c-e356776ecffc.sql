
DO $$
BEGIN
  PERFORM set_config('app.import_mode', 'on', true);

  UPDATE public.tab_journal_entries
  SET entry_type = 'apertura'
  WHERE enterprise_id = 34
    AND entry_type = 'diario'
    AND deleted_at IS NULL
    AND description ~* '^\s*APERTURA\b';

  UPDATE public.tab_journal_entries
  SET entry_type = 'cierre'
  WHERE enterprise_id = 34
    AND entry_type = 'diario'
    AND deleted_at IS NULL
    AND (
      description ~* '^\s*CIERRE\b'
      OR description ~* '^\s*REGISTRO\s+(DEL?\s+)?CIERRE\b'
    );
END $$;

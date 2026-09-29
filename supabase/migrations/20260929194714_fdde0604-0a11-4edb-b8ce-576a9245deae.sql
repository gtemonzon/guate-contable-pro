DO $$
BEGIN
  PERFORM set_config('app.import_mode','on', true);
  UPDATE tab_journal_entries SET reversal_entry_id = NULL WHERE reversal_entry_id IN (30850,30863);
  UPDATE tab_journal_entries SET reversed_by_entry_id = NULL WHERE id IN (30850,30863);
  UPDATE tab_bank_movements SET journal_entry_id = NULL WHERE journal_entry_id IN (30850,30863);
  UPDATE tab_bank_documents SET reversal_journal_entry_id = NULL WHERE reversal_journal_entry_id IN (30850,30863);
  DELETE FROM tab_journal_entry_details WHERE journal_entry_id IN (30850,30863);
  DELETE FROM tab_journal_entries WHERE id IN (30850,30863) AND enterprise_id = 44;
  UPDATE tab_journal_entries SET status='borrador', is_posted=false, posted_at=NULL, updated_at=now()
   WHERE id = 30849 AND enterprise_id = 44;
  PERFORM set_config('app.import_mode','off', true);
END $$;
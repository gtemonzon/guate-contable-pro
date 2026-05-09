UPDATE tab_accounting_periods SET status = 'abierto', closed_at = NULL, closed_by = NULL WHERE id = 394;

UPDATE tab_journal_entries SET is_posted = true, posted_at = now()
WHERE enterprise_id = 36 AND id IN (12263, 12264) AND is_posted = false;

UPDATE tab_accounting_periods SET status = 'cerrado', closed_at = now() WHERE id = 394;
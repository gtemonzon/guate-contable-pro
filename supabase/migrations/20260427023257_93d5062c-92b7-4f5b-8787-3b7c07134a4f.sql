-- Cleanup: remove duplicate "mayor" account lines from imported journal entries
-- The legacy Access system stored both the movement account and its parent (mayor) for each line.
-- We keep only the movement accounts (allows_movement = true) for entries imported with prefix IMP-.
DELETE FROM tab_journal_entry_details jl
USING tab_journal_entries je, tab_accounts a
WHERE jl.journal_entry_id = je.id
  AND jl.account_id = a.id
  AND je.enterprise_id = 33
  AND je.entry_number LIKE 'IMP-%'
  AND a.allows_movement = false;

-- Re-sequence line_number per entry so they remain contiguous
WITH renum AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY journal_entry_id ORDER BY line_number, id) AS new_ln
  FROM tab_journal_entry_details
  WHERE journal_entry_id IN (
    SELECT id FROM tab_journal_entries WHERE enterprise_id = 33 AND entry_number LIKE 'IMP-%'
  )
)
UPDATE tab_journal_entry_details d
SET line_number = renum.new_ln
FROM renum
WHERE d.id = renum.id;

-- Create journal entry history table
CREATE TABLE public.tab_journal_entry_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  journal_entry_id bigint NOT NULL REFERENCES public.tab_journal_entries(id) ON DELETE CASCADE,
  enterprise_id bigint REFERENCES public.tab_enterprises(id),
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_type text NOT NULL DEFAULT 'UPDATE', -- UPDATE, STATUS_CHANGE, etc.
  old_header jsonb,
  new_header jsonb,
  old_details jsonb,
  new_details jsonb,
  change_summary text
);

-- Enable RLS
ALTER TABLE public.tab_journal_entry_history ENABLE ROW LEVEL SECURITY;

-- RLS: users can view history for entries in their enterprises
CREATE POLICY "Users can view history for their enterprises"
ON public.tab_journal_entry_history
FOR SELECT
USING (
  enterprise_id IN (
    SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
  )
);

-- Index for fast lookups
CREATE INDEX idx_journal_entry_history_entry_id ON public.tab_journal_entry_history(journal_entry_id);
CREATE INDEX idx_journal_entry_history_changed_at ON public.tab_journal_entry_history(changed_at DESC);

-- Trigger function to snapshot journal entry before modification
CREATE OR REPLACE FUNCTION public.snapshot_journal_entry_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_old_details jsonb;
  v_new_details jsonb;
  v_change_summary text;
  v_excluded_cols text[] := ARRAY['updated_at','updated_by','created_at','created_by','posted_at','reviewed_at','reviewed_by','deleted_at','deleted_by'];
  v_old_filtered jsonb;
  v_new_filtered jsonb;
  v_col text;
BEGIN
  -- Filter out system columns for comparison
  v_old_filtered := to_jsonb(OLD);
  v_new_filtered := to_jsonb(NEW);
  FOREACH v_col IN ARRAY v_excluded_cols LOOP
    v_old_filtered := v_old_filtered - v_col;
    v_new_filtered := v_new_filtered - v_col;
  END LOOP;

  -- Skip if no meaningful changes
  IF v_old_filtered = v_new_filtered THEN
    RETURN NEW;
  END IF;

  -- Capture current detail lines
  SELECT jsonb_agg(row_to_json(d.*)::jsonb ORDER BY d.line_number)
  INTO v_old_details
  FROM tab_journal_entry_details d
  WHERE d.journal_entry_id = OLD.id AND d.deleted_at IS NULL;

  -- Build change summary
  v_change_summary := '';
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_change_summary := 'Estado: ' || COALESCE(OLD.status,'—') || ' → ' || COALESCE(NEW.status,'—');
  END IF;
  IF OLD.description IS DISTINCT FROM NEW.description THEN
    v_change_summary := v_change_summary || CASE WHEN v_change_summary != '' THEN '; ' ELSE '' END || 'Descripción modificada';
  END IF;
  IF OLD.total_debit IS DISTINCT FROM NEW.total_debit OR OLD.total_credit IS DISTINCT FROM NEW.total_credit THEN
    v_change_summary := v_change_summary || CASE WHEN v_change_summary != '' THEN '; ' ELSE '' END || 'Montos modificados';
  END IF;
  IF v_change_summary = '' THEN
    v_change_summary := 'Partida modificada';
  END IF;

  INSERT INTO tab_journal_entry_history (
    journal_entry_id, enterprise_id, changed_by, change_type,
    old_header, new_header, old_details, change_summary
  ) VALUES (
    OLD.id, OLD.enterprise_id, auth.uid(), 'UPDATE',
    to_jsonb(OLD), to_jsonb(NEW), v_old_details, v_change_summary
  );

  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trg_journal_entry_history
BEFORE UPDATE ON public.tab_journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_journal_entry_history();

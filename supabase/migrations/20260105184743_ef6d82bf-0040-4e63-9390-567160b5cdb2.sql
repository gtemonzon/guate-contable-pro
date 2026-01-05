-- First migration: Add new role values to the existing app_role enum
-- Note: These values need to be committed before they can be used in functions
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'contador_senior';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'auxiliar_contable';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'cliente';

-- Add status column to tab_journal_entries for approval workflow
ALTER TABLE public.tab_journal_entries 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'borrador';

-- Add constraint for valid status values
ALTER TABLE public.tab_journal_entries
DROP CONSTRAINT IF EXISTS tab_journal_entries_status_check;

ALTER TABLE public.tab_journal_entries
ADD CONSTRAINT tab_journal_entries_status_check 
CHECK (status IN ('borrador', 'pendiente_revision', 'aprobado', 'contabilizado', 'rechazado'));

-- Add columns for tracking review/approval
ALTER TABLE public.tab_journal_entries 
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

ALTER TABLE public.tab_journal_entries 
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.tab_journal_entries 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Migrate existing data: posted entries become 'contabilizado', others stay 'borrador'
UPDATE public.tab_journal_entries 
SET status = CASE 
  WHEN is_posted = true THEN 'contabilizado' 
  ELSE 'borrador' 
END
WHERE status IS NULL OR status = 'borrador';
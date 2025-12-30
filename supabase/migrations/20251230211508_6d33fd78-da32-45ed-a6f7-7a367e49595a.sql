-- Agregar columnas de auditoría para modificaciones
ALTER TABLE public.tab_journal_entries 
ADD COLUMN updated_by uuid REFERENCES public.tab_users(id) ON DELETE SET NULL,
ADD COLUMN updated_at timestamp with time zone;
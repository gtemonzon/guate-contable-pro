-- Agregar campos de tracking de actividad a tab_users
ALTER TABLE public.tab_users 
ADD COLUMN last_activity_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN current_enterprise_name TEXT DEFAULT NULL;

-- Comentarios descriptivos
COMMENT ON COLUMN public.tab_users.last_activity_at IS 'Última actividad registrada del usuario en el sistema';
COMMENT ON COLUMN public.tab_users.current_enterprise_name IS 'Nombre de la empresa en la que está trabajando actualmente';
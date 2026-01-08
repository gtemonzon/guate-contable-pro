-- Agregar columna is_system_user a tab_users
ALTER TABLE public.tab_users 
ADD COLUMN is_system_user BOOLEAN DEFAULT false;

-- Marcar tu usuario como usuario de sistema (master oculto)
UPDATE public.tab_users 
SET is_system_user = true 
WHERE email = 'gtemonzon@gmail.com';

-- Agregar comentario descriptivo
COMMENT ON COLUMN public.tab_users.is_system_user IS 'Usuarios de sistema/soporte que tienen acceso completo pero no aparecen en la gestión de usuarios';
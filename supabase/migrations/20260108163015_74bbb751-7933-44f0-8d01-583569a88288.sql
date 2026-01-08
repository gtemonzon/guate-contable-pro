-- Habilitar replica identity para capturar todos los cambios
ALTER TABLE public.tab_users REPLICA IDENTITY FULL;

-- Agregar tabla a la publicación de realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tab_users;
ALTER TABLE public.tab_users 
ADD COLUMN last_enterprise_id bigint REFERENCES public.tab_enterprises(id) ON DELETE SET NULL;
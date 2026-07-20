ALTER TABLE public.tab_users DISABLE TRIGGER USER;
DELETE FROM public.tab_user_enterprises WHERE user_id='a41831df-3f27-4ffb-b1ca-89dc0423f812';
DELETE FROM public.user_roles WHERE user_id='a41831df-3f27-4ffb-b1ca-89dc0423f812';
DELETE FROM public.tab_users WHERE id='a41831df-3f27-4ffb-b1ca-89dc0423f812';
ALTER TABLE public.tab_users ENABLE TRIGGER USER;
DELETE FROM auth.users WHERE id='a41831df-3f27-4ffb-b1ca-89dc0423f812';
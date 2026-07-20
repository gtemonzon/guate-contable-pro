ALTER TABLE public.tab_users DISABLE TRIGGER USER;
UPDATE public.tab_users SET is_active=true, tenant_id=1, last_enterprise_id=NULL WHERE email='stuart19100@hotmail.com';
ALTER TABLE public.tab_users ENABLE TRIGGER USER;
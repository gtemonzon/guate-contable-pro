UPDATE public.tab_user_enterprises
SET role = 'enterprise_admin'
WHERE role = 'admin_empresa';

DROP POLICY IF EXISTS "Enterprise admins manage non-admin roles in their enterprise" ON public.user_roles;
DROP POLICY IF EXISTS "Enterprise admins update non-admin roles in their enterprise" ON public.user_roles;
DROP POLICY IF EXISTS "Enterprise admins delete non-admin roles in their enterprise" ON public.user_roles;

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_enterprise_admin_requires_enterprise;

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.get_user_role(uuid, bigint);

ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
DROP TYPE public.app_role;

CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'enterprise_admin',
  'contador_senior',
  'auxiliar_contable',
  'cliente'
);

ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role USING role::public.app_role;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_enterprise_admin_requires_enterprise
  CHECK (role <> 'enterprise_admin'::public.app_role OR enterprise_id IS NOT NULL) NOT VALID;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid, _enterprise_id bigint)
RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT role FROM public.user_roles 
  WHERE user_id = _user_id 
  AND (enterprise_id = _enterprise_id OR enterprise_id IS NULL)
  ORDER BY 
    CASE role 
      WHEN 'super_admin' THEN 1
      WHEN 'enterprise_admin' THEN 2
      WHEN 'contador_senior' THEN 3
      WHEN 'auxiliar_contable' THEN 4
      WHEN 'cliente' THEN 5
      ELSE 6
    END
  LIMIT 1
$$;

CREATE POLICY "Enterprise admins manage non-admin roles in their enterprise"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  enterprise_id IS NOT NULL
  AND role <> ALL (ARRAY['super_admin'::public.app_role, 'enterprise_admin'::public.app_role])
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);

CREATE POLICY "Enterprise admins update non-admin roles in their enterprise"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  enterprise_id IS NOT NULL
  AND role <> ALL (ARRAY['super_admin'::public.app_role, 'enterprise_admin'::public.app_role])
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
)
WITH CHECK (
  enterprise_id IS NOT NULL
  AND role <> ALL (ARRAY['super_admin'::public.app_role, 'enterprise_admin'::public.app_role])
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);

CREATE POLICY "Enterprise admins delete non-admin roles in their enterprise"
ON public.user_roles FOR DELETE TO authenticated
USING (
  enterprise_id IS NOT NULL
  AND role <> ALL (ARRAY['super_admin'::public.app_role, 'enterprise_admin'::public.app_role])
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);
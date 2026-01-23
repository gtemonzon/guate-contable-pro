-- Fix RLS recursion loop between tab_users and tab_user_enterprises
-- Root cause: tab_users SELECT policy queries tab_user_enterprises, whose SELECT policy queries tab_users.
-- Solution: remove any tab_users references from tab_user_enterprises policies and make admin checks use bypass functions.

-- 1) Make core helper functions bypass RLS (safer for future policies)
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tab_users
    WHERE id = _user_id
      AND is_super_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin_for(user_uuid uuid, check_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tab_users
    WHERE id = user_uuid
      AND tenant_id = check_tenant_id
      AND is_tenant_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_uuid uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT tenant_id
  FROM public.tab_users
  WHERE id = user_uuid;
$$;

CREATE OR REPLACE FUNCTION public.can_access_tenant(user_uuid uuid, check_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT public.is_super_admin(user_uuid)
     OR public.get_user_tenant_id(user_uuid) = check_tenant_id;
$$;

-- 2) Update tab_users UPDATE policy to use the (now bypassing) function
DROP POLICY IF EXISTS "Super admins update other users" ON public.tab_users;
CREATE POLICY "Super admins update other users"
ON public.tab_users
FOR UPDATE
USING (public.is_super_admin(auth.uid()) AND (auth.uid() <> id))
WITH CHECK (public.is_super_admin(auth.uid()) AND (auth.uid() <> id));

-- 3) Fix tab_user_enterprises SELECT policy to avoid referencing tab_users
DROP POLICY IF EXISTS "Users can view their enterprise relationships" ON public.tab_user_enterprises;

CREATE POLICY "Users can view their enterprise relationships"
ON public.tab_user_enterprises
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.tab_enterprises e
    WHERE e.id = tab_user_enterprises.enterprise_id
      AND public.is_tenant_admin_for(auth.uid(), e.tenant_id)
  )
);

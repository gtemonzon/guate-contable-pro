-- Properly avoid RLS recursion when tab_users policies need to check admin flags.
-- SECURITY DEFINER alone is not enough; we must disable row_security inside helper functions.

CREATE OR REPLACE FUNCTION public.is_super_admin_bypass(_user_id uuid)
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

CREATE OR REPLACE FUNCTION public.is_tenant_admin_for_bypass(user_uuid uuid, check_tenant_id bigint)
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

-- Replace policy to use bypass functions (no recursion)
DROP POLICY IF EXISTS "Users can view authorized users only" ON public.tab_users;

CREATE POLICY "Users can view authorized users only"
ON public.tab_users
FOR SELECT
USING (
  tab_users.id = auth.uid()
  OR public.is_super_admin_bypass(auth.uid())
  OR public.is_tenant_admin_for_bypass(auth.uid(), tab_users.tenant_id)
  OR EXISTS (
    SELECT 1
    FROM public.tab_user_enterprises ue_admin
    JOIN public.tab_user_enterprises ue_target
      ON ue_target.enterprise_id = ue_admin.enterprise_id
    WHERE ue_admin.user_id = auth.uid()
      AND ue_admin.role = 'enterprise_admin'
      AND ue_target.user_id = tab_users.id
  )
);

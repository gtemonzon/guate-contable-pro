-- Fix infinite recursion in tab_users RLS policy (proper fix)
-- IMPORTANT: Policies on tab_users must NOT query tab_users.

DROP POLICY IF EXISTS "Users can view authorized users only" ON public.tab_users;

CREATE POLICY "Users can view authorized users only"
ON public.tab_users
FOR SELECT
USING (
  -- Self access
  tab_users.id = auth.uid()

  -- Global super admin (uses SECURITY DEFINER function; no tab_users reference)
  OR public.is_super_admin(auth.uid())

  -- Tenant admin can view users within their tenant (SECURITY DEFINER function)
  OR public.is_tenant_admin_for(auth.uid(), tab_users.tenant_id)

  -- Enterprise admins can view users linked to the same enterprise(s)
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
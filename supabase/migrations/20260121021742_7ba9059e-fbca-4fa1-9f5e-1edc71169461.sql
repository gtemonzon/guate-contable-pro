-- =============================================
-- SECURITY FIX: Tighten RLS policies for tab_users and tab_enterprises
-- =============================================

-- Fix 1: Drop and recreate tab_users SELECT policy to be more restrictive
-- Only allow: own record, super admins, tenant admins, or users in same enterprise
DROP POLICY IF EXISTS "Users can view users in their tenant" ON public.tab_users;

CREATE POLICY "Users can view authorized users only"
ON public.tab_users
FOR SELECT
USING (
  -- Users can always view their own record
  id = auth.uid()
  OR
  -- Super admins can view all users
  is_super_admin(auth.uid())
  OR
  -- Tenant admins can view users in their tenant
  (tenant_id = get_user_tenant_id(auth.uid()) AND is_tenant_admin_for(auth.uid(), tenant_id))
  OR
  -- Enterprise admins can view users in their enterprises only
  (
    EXISTS (
      SELECT 1 FROM tab_user_enterprises ue1
      JOIN tab_user_enterprises ue2 ON ue1.enterprise_id = ue2.enterprise_id
      WHERE ue1.user_id = auth.uid()
      AND ue2.user_id = tab_users.id
      AND ue1.role IN ('enterprise_admin', 'super_admin')
    )
  )
);

-- Fix 2: The tab_enterprises policy already restricts via tab_user_enterprises
-- But let's ensure it's explicitly clear - users can ONLY see enterprises they are linked to
DROP POLICY IF EXISTS "Users can view enterprises in their tenant" ON public.tab_enterprises;

CREATE POLICY "Users can view their linked enterprises only"
ON public.tab_enterprises
FOR SELECT
USING (
  -- Super admins can view all enterprises in their accessible tenants
  (is_super_admin(auth.uid()) AND can_access_tenant(auth.uid(), tenant_id))
  OR
  -- Tenant admins can view all enterprises in their tenant
  (is_tenant_admin_for(auth.uid(), tenant_id) AND can_access_tenant(auth.uid(), tenant_id))
  OR
  -- Regular users can only view enterprises they are explicitly linked to
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id
    AND tab_user_enterprises.user_id = auth.uid()
  )
);
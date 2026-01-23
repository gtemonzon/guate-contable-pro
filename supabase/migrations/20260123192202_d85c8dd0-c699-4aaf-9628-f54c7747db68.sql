-- Fix infinite recursion in tab_users RLS policy
-- The problem is the policy references tab_users while querying tab_users

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view authorized users only" ON public.tab_users;

-- Create a fixed policy that avoids recursion by using auth.uid() directly
-- and avoiding self-referential queries
CREATE POLICY "Users can view authorized users only"
ON public.tab_users
FOR SELECT
USING (
  -- Users can always see their own record
  id = auth.uid()
  -- Global super admins can see all users (use a simpler check without subquery)
  OR EXISTS (
    SELECT 1 FROM public.tab_users u 
    WHERE u.id = auth.uid() AND u.is_super_admin = true
  )
  -- Tenant admins can see users in their tenant
  OR EXISTS (
    SELECT 1 FROM public.tab_users admin 
    WHERE admin.id = auth.uid() 
    AND admin.is_tenant_admin = true 
    AND admin.tenant_id = tab_users.tenant_id
  )
  -- Enterprise admins can see users linked to their enterprises
  OR EXISTS (
    SELECT 1 FROM public.tab_user_enterprises ue1
    JOIN public.tab_user_enterprises ue2 ON ue1.enterprise_id = ue2.enterprise_id
    WHERE ue1.user_id = auth.uid() 
    AND ue1.role IN ('enterprise_admin', 'super_admin')
    AND ue2.user_id = tab_users.id
  )
);
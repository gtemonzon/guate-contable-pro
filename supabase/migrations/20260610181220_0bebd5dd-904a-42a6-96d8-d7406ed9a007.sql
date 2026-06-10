DROP POLICY IF EXISTS "Users can view authorized users only" ON public.tab_users;

CREATE POLICY "Users can view authorized users only"
ON public.tab_users
FOR SELECT
USING (
  id = auth.uid()
  OR is_super_admin_bypass(auth.uid())
  OR (
    is_super_admin IS NOT TRUE
    AND is_tenant_admin_for_bypass(auth.uid(), tenant_id)
  )
);
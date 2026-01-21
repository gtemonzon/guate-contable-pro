-- Allow tenant admins and global super admins to manage tab_user_enterprises safely

-- 1) Helper function: can_manage_user_enterprise_link
CREATE OR REPLACE FUNCTION public.can_manage_user_enterprise_link(
  actor_user_id uuid,
  target_user_id uuid,
  target_enterprise_id bigint
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH ent AS (
    SELECT tenant_id
    FROM public.tab_enterprises
    WHERE id = target_enterprise_id
  ), tgt AS (
    SELECT tenant_id
    FROM public.tab_users
    WHERE id = target_user_id
  )
  SELECT
    -- Global super admin can manage links across all tenants
    public.is_super_admin(actor_user_id)
    OR (
      -- Tenant admin can manage links inside their own tenant
      EXISTS (
        SELECT 1
        FROM ent
        JOIN tgt ON true
        WHERE ent.tenant_id = tgt.tenant_id
          AND public.is_tenant_admin_for(actor_user_id, ent.tenant_id)
      )
    );
$$;

-- 2) Policies on tab_user_enterprises
ALTER TABLE public.tab_user_enterprises ENABLE ROW LEVEL SECURITY;

-- Insert: allow global super admins and tenant admins (within tenant)
DROP POLICY IF EXISTS "Super admin can insert relationships" ON public.tab_user_enterprises;
CREATE POLICY "Super admin can insert relationships"
ON public.tab_user_enterprises
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_user_enterprise_link(auth.uid(), user_id, enterprise_id)
);

-- Update: existing policy might not include WITH CHECK; keep super admin, add tenant admin
DROP POLICY IF EXISTS "Super admin can manage relationships" ON public.tab_user_enterprises;
CREATE POLICY "Admins can update relationships"
ON public.tab_user_enterprises
FOR UPDATE
TO authenticated
USING (
  public.can_manage_user_enterprise_link(auth.uid(), user_id, enterprise_id)
)
WITH CHECK (
  public.can_manage_user_enterprise_link(auth.uid(), user_id, enterprise_id)
);

-- Delete: existing policy only super admin; extend to tenant admin within tenant
DROP POLICY IF EXISTS "Super admin can delete relationships" ON public.tab_user_enterprises;
CREATE POLICY "Admins can delete relationships"
ON public.tab_user_enterprises
FOR DELETE
TO authenticated
USING (
  public.can_manage_user_enterprise_link(auth.uid(), user_id, enterprise_id)
);

-- Keep the self-insert policy for normal users (narrow)
-- (Do not drop "Users can create enterprise relationships")

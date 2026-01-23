-- Break RLS recursion loop between tab_enterprises <-> tab_user_enterprises
-- by moving cross-table checks into SECURITY DEFINER functions with row_security=off.

-- 1) Helper: enterprise tenant id (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_enterprise_tenant_id(_enterprise_id bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT tenant_id
  FROM public.tab_enterprises
  WHERE id = _enterprise_id;
$$;

-- 2) Helper: whether a user is linked to an enterprise (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_is_linked_to_enterprise(_user_id uuid, _enterprise_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tab_user_enterprises
    WHERE user_id = _user_id
      AND enterprise_id = _enterprise_id
  );
$$;

-- 3) Update can_manage_user_enterprise_link to bypass RLS and avoid joining tables under policy evaluation
CREATE OR REPLACE FUNCTION public.can_manage_user_enterprise_link(actor_user_id uuid, target_user_id uuid, target_enterprise_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  WITH ent_tenant AS (
    SELECT public.get_enterprise_tenant_id(target_enterprise_id) AS tenant_id
  ), tgt_tenant AS (
    SELECT public.get_user_tenant_id(target_user_id) AS tenant_id
  )
  SELECT
    public.is_super_admin(actor_user_id)
    OR EXISTS (
      SELECT 1
      FROM ent_tenant e
      JOIN tgt_tenant t ON true
      WHERE e.tenant_id IS NOT NULL
        AND e.tenant_id = t.tenant_id
        AND public.is_tenant_admin_for(actor_user_id, e.tenant_id)
    );
$$;

-- 4) Rewrite tab_enterprises policies to avoid direct reference to tab_user_enterprises
DROP POLICY IF EXISTS "Users can view their linked enterprises only" ON public.tab_enterprises;
CREATE POLICY "Users can view their linked enterprises only"
ON public.tab_enterprises
FOR SELECT
USING (
  (public.is_super_admin(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id))
  OR (public.is_tenant_admin_for(auth.uid(), tenant_id) AND public.can_access_tenant(auth.uid(), tenant_id))
  OR public.user_is_linked_to_enterprise(auth.uid(), id)
);

DROP POLICY IF EXISTS "Tenant admins can update enterprises" ON public.tab_enterprises;
CREATE POLICY "Tenant admins can update enterprises"
ON public.tab_enterprises
FOR UPDATE
USING (
  public.can_access_tenant(auth.uid(), tenant_id)
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin_for(auth.uid(), tenant_id)
    OR public.user_is_linked_to_enterprise(auth.uid(), id)
  )
)
WITH CHECK (
  public.can_access_tenant(auth.uid(), tenant_id)
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin_for(auth.uid(), tenant_id)
    OR public.user_is_linked_to_enterprise(auth.uid(), id)
  )
);

-- 5) Rewrite tab_user_enterprises SELECT policy to avoid direct reference to tab_enterprises
DROP POLICY IF EXISTS "Users can view their enterprise relationships" ON public.tab_user_enterprises;
CREATE POLICY "Users can view their enterprise relationships"
ON public.tab_user_enterprises
FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR public.is_tenant_admin_for(auth.uid(), public.get_enterprise_tenant_id(enterprise_id))
);

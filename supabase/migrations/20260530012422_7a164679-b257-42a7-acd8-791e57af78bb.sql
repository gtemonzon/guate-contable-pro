
-- 1. Fix is_support_agent: only super_admins (or explicit support role) qualify, not tenant admins
CREATE OR REPLACE FUNCTION public.is_support_agent(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tab_users
    WHERE id = p_user_id
      AND is_super_admin = true
      AND COALESCE(is_active, true) = true
      AND COALESCE(is_system_user, false) = false
  );
$$;

-- 2. Prevent privilege escalation via self-update of tab_users
-- Trigger blocks any non-super-admin from changing privileged columns on their own row
CREATE OR REPLACE FUNCTION public.prevent_user_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_is_super boolean;
BEGIN
  -- Allow service_role / postgres (no auth.uid()) to do anything
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT is_super_admin INTO v_is_super
  FROM public.tab_users WHERE id = auth.uid();

  IF COALESCE(v_is_super, false) = true THEN
    RETURN NEW;
  END IF;

  -- Non-super-admin: block changes to privileged / tenant-scoping columns
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.is_tenant_admin IS DISTINCT FROM OLD.is_tenant_admin
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.is_system_user IS DISTINCT FROM OLD.is_system_user
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No autorizado para modificar campos privilegiados';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_privilege_escalation ON public.tab_users;
CREATE TRIGGER trg_prevent_user_privilege_escalation
BEFORE UPDATE ON public.tab_users
FOR EACH ROW EXECUTE FUNCTION public.prevent_user_privilege_escalation();

-- 3. Fix SECURITY DEFINER view v_rls_coverage -> use security_invoker
ALTER VIEW IF EXISTS public.v_rls_coverage SET (security_invoker = true);

-- 4. Restrict Realtime channel subscriptions: enable RLS on realtime.messages and
-- only allow authenticated users to subscribe (no anon broadcast eavesdropping).
-- Topic format for legacy import jobs is enforced by the client; require auth + topic ownership.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe to own enterprise channels" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe to own enterprise channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- topic pattern: "legacy-import-job:<jobId>" or generic table topics
  -- Allow if the user is linked to the enterprise referenced by any job whose id appears in the topic,
  -- or fall back to standard postgres_changes topics (which are already filtered by RLS on the source table).
  CASE
    WHEN realtime.topic() LIKE 'legacy-import-job:%' THEN EXISTS (
      SELECT 1
      FROM public.tab_legacy_import_jobs j
      JOIN public.tab_user_enterprises ue ON ue.enterprise_id = j.enterprise_id
      WHERE j.id::text = split_part(realtime.topic(), ':', 2)
        AND ue.user_id = auth.uid()
    )
    ELSE true
  END
);

DROP POLICY IF EXISTS "Authenticated users can broadcast to own enterprise channels" ON realtime.messages;
CREATE POLICY "Authenticated users can broadcast to own enterprise channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN realtime.topic() LIKE 'legacy-import-job:%' THEN EXISTS (
      SELECT 1
      FROM public.tab_legacy_import_jobs j
      JOIN public.tab_user_enterprises ue ON ue.enterprise_id = j.enterprise_id
      WHERE j.id::text = split_part(realtime.topic(), ':', 2)
        AND ue.user_id = auth.uid()
    )
    ELSE true
  END
);

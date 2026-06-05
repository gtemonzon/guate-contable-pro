
-- Fix 1: Remove self-insert policy on tab_user_enterprises (privilege escalation risk)
DROP POLICY IF EXISTS "Users can create enterprise relationships" ON public.tab_user_enterprises;

-- Fix 2: Tighten realtime.messages policies - replace permissive ELSE true with false
DROP POLICY IF EXISTS "Authenticated users can subscribe to own enterprise channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated users can broadcast to own enterprise channels" ON realtime.messages;

CREATE POLICY "Authenticated users can subscribe to own enterprise channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  CASE
    WHEN realtime.topic() LIKE 'legacy-import-job:%' THEN EXISTS (
      SELECT 1
      FROM public.tab_legacy_import_jobs j
      JOIN public.tab_user_enterprises ue ON ue.enterprise_id = j.enterprise_id
      WHERE j.id::text = split_part(realtime.topic(), ':', 2)
        AND ue.user_id = auth.uid()
    )
    ELSE false
  END
);

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
    ELSE false
  END
);

-- Fix 3: Restrict tab_audit_log SELECT for tenant admins to only enterprises they have membership in
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.tab_audit_log;

CREATE POLICY "Admins can view audit logs"
ON public.tab_audit_log
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR enterprise_id IN (
    SELECT ue.enterprise_id
    FROM public.tab_user_enterprises ue
    WHERE ue.user_id = auth.uid()
      AND ue.deleted_at IS NULL
  )
);

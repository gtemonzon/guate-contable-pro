CREATE POLICY "Admins view tenant training progress"
ON public.tab_training_progress
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tab_users me
    JOIN public.tab_users target ON target.id = tab_training_progress.user_id
    WHERE me.id = auth.uid()
      AND (
        me.is_super_admin = true
        OR (me.is_tenant_admin = true AND me.tenant_id = target.tenant_id)
      )
  )
);
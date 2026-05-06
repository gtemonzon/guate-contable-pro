DROP POLICY IF EXISTS "Insert import jobs for own tenant" ON public.tab_legacy_import_jobs;
DROP POLICY IF EXISTS "Update import jobs of own tenant" ON public.tab_legacy_import_jobs;
DROP POLICY IF EXISTS "View import jobs of own tenant" ON public.tab_legacy_import_jobs;

CREATE POLICY "Insert import jobs for linked enterprise"
ON public.tab_legacy_import_jobs FOR INSERT
WITH CHECK (
  created_by = auth.uid()
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  )
);

CREATE POLICY "View import jobs of linked enterprise"
ON public.tab_legacy_import_jobs FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
);

CREATE POLICY "Update import jobs of linked enterprise"
ON public.tab_legacy_import_jobs FOR UPDATE
USING (
  public.is_super_admin(auth.uid())
  OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
);
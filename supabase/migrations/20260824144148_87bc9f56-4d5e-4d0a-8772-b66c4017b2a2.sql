-- 1) Revoke EXECUTE from anon on all public functions (no anon-facing RPCs exist)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- 2) Trigger functions must never be directly callable
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated, anon, PUBLIC', r.sig);
  END LOOP;
END $$;

-- 3) Destructive admin-only maintenance function: server-side only
REVOKE ALL ON FUNCTION public.hard_reset_enterprise(bigint) FROM authenticated, anon, PUBLIC;

-- 4) Tenant logos: public URLs still work (public bucket), but listing is restricted
DROP POLICY IF EXISTS "Tenant logos are publicly accessible" ON storage.objects;
CREATE POLICY "Super admins can list tenant logos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'tenant-logos' AND public.is_super_admin(auth.uid()));

-- 5) Collection tracking: block edits on finalized (paid/reconciled) records
DROP POLICY IF EXISTS "collection_tracking_update" ON public.tab_collection_tracking;
CREATE POLICY "collection_tracking_update"
ON public.tab_collection_tracking FOR UPDATE
TO authenticated
USING (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
  )
  AND COALESCE(status, 'pendiente') NOT IN ('pagado', 'pagada', 'conciliado', 'conciliada', 'cerrado')
)
WITH CHECK (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises WHERE user_id = auth.uid()
  )
);
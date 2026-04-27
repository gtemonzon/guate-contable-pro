CREATE TABLE public.tab_legacy_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step TEXT,
  current_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload JSONB NOT NULL,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_legacy_jobs_enterprise ON public.tab_legacy_import_jobs(enterprise_id, status);
CREATE INDEX idx_legacy_jobs_tenant ON public.tab_legacy_import_jobs(tenant_id);

ALTER TABLE public.tab_legacy_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View import jobs of own tenant"
ON public.tab_legacy_import_jobs FOR SELECT
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE POLICY "Insert import jobs for own tenant"
ON public.tab_legacy_import_jobs FOR INSERT
WITH CHECK (
  (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'))
  AND created_by = auth.uid()
);

CREATE POLICY "Update import jobs of own tenant"
ON public.tab_legacy_import_jobs FOR UPDATE
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE TRIGGER trg_legacy_import_jobs_updated
BEFORE UPDATE ON public.tab_legacy_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.tab_legacy_import_jobs;
ALTER TABLE public.tab_legacy_import_jobs REPLICA IDENTITY FULL;
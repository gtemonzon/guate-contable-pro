CREATE TABLE public.fixed_asset_attachments (
  id            BIGSERIAL PRIMARY KEY,
  asset_id      BIGINT NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  enterprise_id BIGINT NOT NULL REFERENCES public.tab_enterprises(id),
  file_name     TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  original_size BIGINT,
  uploaded_by   UUID,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fixed_asset_attachments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fixed_asset_attachments_id_seq TO authenticated;
GRANT ALL ON public.fixed_asset_attachments TO service_role;
GRANT ALL ON SEQUENCE public.fixed_asset_attachments_id_seq TO service_role;

ALTER TABLE public.fixed_asset_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_attachments_select" ON public.fixed_asset_attachments
  FOR SELECT TO authenticated USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "asset_attachments_insert" ON public.fixed_asset_attachments
  FOR INSERT TO authenticated WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "asset_attachments_update" ON public.fixed_asset_attachments
  FOR UPDATE TO authenticated USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "asset_attachments_delete" ON public.fixed_asset_attachments
  FOR DELETE TO authenticated USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE INDEX idx_asset_attachments_asset ON public.fixed_asset_attachments(asset_id) WHERE is_active;
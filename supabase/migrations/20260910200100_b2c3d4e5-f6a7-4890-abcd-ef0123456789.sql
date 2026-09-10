-- Activos Fijos: historial real de custodios (asignación / entrega).
-- fixed_assets.custodian_id pasa a ser solo "custodio actual" (se mantiene,
-- lo sincronizan los hooks useAssignCustodian/useReturnCustodian desde el
-- frontend) — el historial completo de quién tuvo el activo y cuándo vive
-- en esta tabla nueva.
CREATE TABLE public.fixed_asset_custodian_assignments (
  id bigint generated always as identity primary key,
  asset_id bigint NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  enterprise_id bigint NOT NULL REFERENCES public.tab_enterprises(id),
  custodian_id bigint NOT NULL REFERENCES public.fixed_asset_custodians(id),
  assigned_date date NOT NULL,
  returned_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_custodian_assignments_asset ON public.fixed_asset_custodian_assignments(asset_id, assigned_date);

-- Un activo no puede tener dos asignaciones abiertas a la vez.
CREATE UNIQUE INDEX idx_one_open_assignment_per_asset
  ON public.fixed_asset_custodian_assignments(asset_id) WHERE returned_date IS NULL;

ALTER TABLE public.fixed_asset_custodian_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fixed_asset_custodian_assignments_select" ON public.fixed_asset_custodian_assignments
  FOR SELECT USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_custodian_assignments_insert" ON public.fixed_asset_custodian_assignments
  FOR INSERT WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_custodian_assignments_update" ON public.fixed_asset_custodian_assignments
  FOR UPDATE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY "fixed_asset_custodian_assignments_delete" ON public.fixed_asset_custodian_assignments
  FOR DELETE USING (
    public.is_super_admin(auth.uid())
    OR public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

-- Backfill: cada activo con custodian_id ya asignado hoy recibe una
-- asignación abierta (returned_date NULL). Fecha de asignación = fecha de
-- activación si el activo ya fue activado, si no la fecha de adquisición.
-- Ejecutado en producción antes de esta migración: 9 activos migrados (de
-- 444 activos totales, 9 tenían custodian_id no nulo — verificado con
-- COUNT independiente antes y después).
INSERT INTO public.fixed_asset_custodian_assignments (asset_id, enterprise_id, custodian_id, assigned_date, returned_date, created_by)
SELECT id, enterprise_id, custodian_id, COALESCE(activated_at::date, acquisition_date), NULL, created_by
FROM public.fixed_assets
WHERE custodian_id IS NOT NULL;

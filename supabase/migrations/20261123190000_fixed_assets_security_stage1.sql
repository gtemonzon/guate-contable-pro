-- Etapa 1 de seguridad de activos fijos:
--  1) los registros hijos de un activo deben pertenecer a la MISMA empresa que el activo
--  2) los documentos de empresa respetan el vínculo retirado (deleted_at)
--  3) un adjunto de activo eliminado (is_active = false) deja de poder abrirse

-- 1) Control: los registros hijos de un activo deben pertenecer a la MISMA empresa que el activo
CREATE OR REPLACE FUNCTION public.enforce_fixed_asset_enterprise_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_ent bigint;
BEGIN
  -- En UPDATE solo se revisa si cambió el activo o la empresa (no se bloquean filas sin cambios)
  IF TG_OP = 'UPDATE'
     AND NEW.asset_id IS NOT DISTINCT FROM OLD.asset_id
     AND NEW.enterprise_id IS NOT DISTINCT FROM OLD.enterprise_id THEN
    IF TG_TABLE_NAME = 'fixed_asset_custodian_assignments' THEN
      IF NEW.custodian_id IS NOT DISTINCT FROM OLD.custodian_id THEN RETURN NEW; END IF;
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.asset_id IS NOT NULL THEN
    SELECT enterprise_id INTO v_ent FROM public.fixed_assets WHERE id = NEW.asset_id;
    IF v_ent IS NULL OR v_ent IS DISTINCT FROM NEW.enterprise_id THEN
      RAISE EXCEPTION 'El activo % no pertenece a la empresa %', NEW.asset_id, NEW.enterprise_id USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'fixed_asset_custodian_assignments' THEN
    IF NEW.custodian_id IS NOT NULL THEN
      SELECT enterprise_id INTO v_ent FROM public.fixed_asset_custodians WHERE id = NEW.custodian_id;
      IF v_ent IS NULL OR v_ent IS DISTINCT FROM NEW.enterprise_id THEN
        RAISE EXCEPTION 'El custodio % no pertenece a la empresa %', NEW.custodian_id, NEW.enterprise_id USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_fixed_asset_enterprise_consistency() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fa_schedule_same_enterprise ON public.fixed_asset_depreciation_schedule;
CREATE TRIGGER trg_fa_schedule_same_enterprise BEFORE INSERT OR UPDATE ON public.fixed_asset_depreciation_schedule
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fixed_asset_enterprise_consistency();
DROP TRIGGER IF EXISTS trg_fa_attachments_same_enterprise ON public.fixed_asset_attachments;
CREATE TRIGGER trg_fa_attachments_same_enterprise BEFORE INSERT OR UPDATE ON public.fixed_asset_attachments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fixed_asset_enterprise_consistency();
DROP TRIGGER IF EXISTS trg_fa_event_log_same_enterprise ON public.fixed_asset_event_log;
CREATE TRIGGER trg_fa_event_log_same_enterprise BEFORE INSERT ON public.fixed_asset_event_log
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fixed_asset_enterprise_consistency();
DROP TRIGGER IF EXISTS trg_fa_assignments_same_enterprise ON public.fixed_asset_custodian_assignments;
CREATE TRIGGER trg_fa_assignments_same_enterprise BEFORE INSERT OR UPDATE ON public.fixed_asset_custodian_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fixed_asset_enterprise_consistency();

-- 2) Control: categoría, ubicación y custodio de un activo deben ser de la misma empresa
CREATE OR REPLACE FUNCTION public.enforce_fixed_asset_references_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_ent bigint;
BEGIN
  IF NEW.category_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id OR NEW.enterprise_id IS DISTINCT FROM OLD.enterprise_id) THEN
    SELECT enterprise_id INTO v_ent FROM public.fixed_asset_categories WHERE id = NEW.category_id;
    IF v_ent IS NULL OR v_ent IS DISTINCT FROM NEW.enterprise_id THEN
      RAISE EXCEPTION 'La categoría % no pertenece a la empresa %', NEW.category_id, NEW.enterprise_id USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.location_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.location_id IS DISTINCT FROM OLD.location_id OR NEW.enterprise_id IS DISTINCT FROM OLD.enterprise_id) THEN
    SELECT enterprise_id INTO v_ent FROM public.fixed_asset_locations WHERE id = NEW.location_id;
    IF v_ent IS NULL OR v_ent IS DISTINCT FROM NEW.enterprise_id THEN
      RAISE EXCEPTION 'La ubicación % no pertenece a la empresa %', NEW.location_id, NEW.enterprise_id USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.custodian_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.custodian_id IS DISTINCT FROM OLD.custodian_id OR NEW.enterprise_id IS DISTINCT FROM OLD.enterprise_id) THEN
    SELECT enterprise_id INTO v_ent FROM public.fixed_asset_custodians WHERE id = NEW.custodian_id;
    IF v_ent IS NULL OR v_ent IS DISTINCT FROM NEW.enterprise_id THEN
      RAISE EXCEPTION 'El custodio % no pertenece a la empresa %', NEW.custodian_id, NEW.enterprise_id USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_fixed_asset_references_consistency() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fa_refs_same_enterprise ON public.fixed_assets;
CREATE TRIGGER trg_fa_refs_same_enterprise BEFORE INSERT OR UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fixed_asset_references_consistency();

-- 3) Documentos de empresa: el acceso retirado (deleted_at) ya no abre documentos
DROP POLICY IF EXISTS "Users can view enterprise documents" ON storage.objects;
CREATE POLICY "Users can view enterprise documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'enterprise-documents' AND (storage.foldername(name))[1] IN (SELECT enterprise_id::text FROM public.tab_user_enterprises WHERE user_id = auth.uid() AND deleted_at IS NULL));
DROP POLICY IF EXISTS "Users can upload enterprise documents" ON storage.objects;
CREATE POLICY "Users can upload enterprise documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'enterprise-documents' AND (storage.foldername(name))[1] IN (SELECT enterprise_id::text FROM public.tab_user_enterprises WHERE user_id = auth.uid() AND deleted_at IS NULL));
DROP POLICY IF EXISTS "Users can update enterprise documents" ON storage.objects;
CREATE POLICY "Users can update enterprise documents" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'enterprise-documents' AND (storage.foldername(name))[1] IN (SELECT enterprise_id::text FROM public.tab_user_enterprises WHERE user_id = auth.uid() AND deleted_at IS NULL))
  WITH CHECK (bucket_id = 'enterprise-documents' AND (storage.foldername(name))[1] IN (SELECT enterprise_id::text FROM public.tab_user_enterprises WHERE user_id = auth.uid() AND deleted_at IS NULL));
DROP POLICY IF EXISTS "Users can delete enterprise documents" ON storage.objects;
CREATE POLICY "Users can delete enterprise documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'enterprise-documents' AND (storage.foldername(name))[1] IN (SELECT enterprise_id::text FROM public.tab_user_enterprises WHERE user_id = auth.uid() AND deleted_at IS NULL));

-- 4) Archivos de activos: un adjunto eliminado (is_active = false) deja de poder abrirse.
--    La ventana de 10 minutos permite que la subida (INSERT ... RETURNING) funcione antes de que exista la fila del adjunto.
DROP POLICY IF EXISTS fixed_asset_attachments_storage_select ON storage.objects;
CREATE POLICY fixed_asset_attachments_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fixed-asset-attachments'
    AND (
      public.is_super_admin(auth.uid())
      OR (
        public.user_is_linked_to_enterprise(auth.uid(), ((storage.foldername(name))[1])::bigint)
        AND (
          objects.created_at > now() - interval '10 minutes'
          OR EXISTS (SELECT 1 FROM public.fixed_asset_attachments fa WHERE fa.file_path = objects.name AND fa.is_active)
        )
      )
    )
  );

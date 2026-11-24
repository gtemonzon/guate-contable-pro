-- Etapa 2 de seguridad de activos fijos: escritura por rol.
--  operar (create_entries): crear/corregir activos en borrador y activarlos, datos no críticos, ubicaciones, custodios, adjuntos, bitácora
--  valoración y contabilidad (edit_accounts o administrador): cambiar valoración de un activo activado, baja, contabilizar/omitir depreciación,
--  categorías y política, eliminar activos

CREATE OR REPLACE FUNCTION public.can_write_fixed_assets(_enterprise_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin(auth.uid())
      OR (public.user_is_linked_to_enterprise(auth.uid(), _enterprise_id)
          AND public.has_role_permission(auth.uid(), _enterprise_id, 'create_entries'));
$$;
CREATE OR REPLACE FUNCTION public.can_manage_fixed_asset_valuation(_enterprise_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin(auth.uid())
      OR (public.user_is_linked_to_enterprise(auth.uid(), _enterprise_id)
          AND public.has_role_permission(auth.uid(), _enterprise_id, 'edit_accounts'));
$$;

-- fixed_assets: operar = create_entries; eliminar = edit_accounts
DROP POLICY IF EXISTS fixed_assets_insert ON public.fixed_assets;
CREATE POLICY fixed_assets_insert ON public.fixed_assets FOR INSERT TO authenticated WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_assets_update ON public.fixed_assets;
CREATE POLICY fixed_assets_update ON public.fixed_assets FOR UPDATE TO authenticated USING (public.can_write_fixed_assets(enterprise_id)) WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_assets_delete ON public.fixed_assets;
CREATE POLICY fixed_assets_delete ON public.fixed_assets FOR DELETE TO authenticated USING (public.can_manage_fixed_asset_valuation(enterprise_id));

-- Cronograma: crear filas PLANNED = operar; contabilizar/omitir (UPDATE) = edit_accounts
DROP POLICY IF EXISTS depreciation_schedule_insert ON public.fixed_asset_depreciation_schedule;
CREATE POLICY depreciation_schedule_insert ON public.fixed_asset_depreciation_schedule FOR INSERT TO authenticated
  WITH CHECK (public.can_write_fixed_assets(enterprise_id) AND (status = 'PLANNED' OR public.can_manage_fixed_asset_valuation(enterprise_id)));
DROP POLICY IF EXISTS depreciation_schedule_update ON public.fixed_asset_depreciation_schedule;
CREATE POLICY depreciation_schedule_update ON public.fixed_asset_depreciation_schedule FOR UPDATE TO authenticated
  USING (public.can_manage_fixed_asset_valuation(enterprise_id)) WITH CHECK (public.can_manage_fixed_asset_valuation(enterprise_id));

-- Bitácora: insertar = operar, y sin suplantar a otro usuario
DROP POLICY IF EXISTS asset_event_log_insert ON public.fixed_asset_event_log;
CREATE POLICY asset_event_log_insert ON public.fixed_asset_event_log FOR INSERT TO authenticated
  WITH CHECK (public.can_write_fixed_assets(enterprise_id) AND (actor_user_id IS NULL OR actor_user_id = auth.uid() OR public.is_super_admin(auth.uid())));

-- Adjuntos y asignaciones de custodio: operar
DROP POLICY IF EXISTS asset_attachments_insert ON public.fixed_asset_attachments;
CREATE POLICY asset_attachments_insert ON public.fixed_asset_attachments FOR INSERT TO authenticated WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS asset_attachments_update ON public.fixed_asset_attachments;
CREATE POLICY asset_attachments_update ON public.fixed_asset_attachments FOR UPDATE TO authenticated USING (public.can_write_fixed_assets(enterprise_id)) WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS asset_attachments_delete ON public.fixed_asset_attachments;
CREATE POLICY asset_attachments_delete ON public.fixed_asset_attachments FOR DELETE TO authenticated USING (public.can_write_fixed_assets(enterprise_id));

DROP POLICY IF EXISTS fixed_asset_custodian_assignments_insert ON public.fixed_asset_custodian_assignments;
CREATE POLICY fixed_asset_custodian_assignments_insert ON public.fixed_asset_custodian_assignments FOR INSERT TO authenticated WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_custodian_assignments_update ON public.fixed_asset_custodian_assignments;
CREATE POLICY fixed_asset_custodian_assignments_update ON public.fixed_asset_custodian_assignments FOR UPDATE TO authenticated USING (public.can_write_fixed_assets(enterprise_id)) WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_custodian_assignments_delete ON public.fixed_asset_custodian_assignments;
CREATE POLICY fixed_asset_custodian_assignments_delete ON public.fixed_asset_custodian_assignments FOR DELETE TO authenticated USING (public.can_write_fixed_assets(enterprise_id));

-- Ubicaciones y custodios: operar
DROP POLICY IF EXISTS fixed_asset_locations_insert ON public.fixed_asset_locations;
CREATE POLICY fixed_asset_locations_insert ON public.fixed_asset_locations FOR INSERT TO authenticated WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_locations_update ON public.fixed_asset_locations;
CREATE POLICY fixed_asset_locations_update ON public.fixed_asset_locations FOR UPDATE TO authenticated USING (public.can_write_fixed_assets(enterprise_id)) WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_locations_delete ON public.fixed_asset_locations;
CREATE POLICY fixed_asset_locations_delete ON public.fixed_asset_locations FOR DELETE TO authenticated USING (public.can_write_fixed_assets(enterprise_id));

DROP POLICY IF EXISTS fixed_asset_custodians_insert ON public.fixed_asset_custodians;
CREATE POLICY fixed_asset_custodians_insert ON public.fixed_asset_custodians FOR INSERT TO authenticated WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_custodians_update ON public.fixed_asset_custodians;
CREATE POLICY fixed_asset_custodians_update ON public.fixed_asset_custodians FOR UPDATE TO authenticated USING (public.can_write_fixed_assets(enterprise_id)) WITH CHECK (public.can_write_fixed_assets(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_custodians_delete ON public.fixed_asset_custodians;
CREATE POLICY fixed_asset_custodians_delete ON public.fixed_asset_custodians FOR DELETE TO authenticated USING (public.can_write_fixed_assets(enterprise_id));

-- Categorías y política de depreciación (definen las cuentas contables): edit_accounts
DROP POLICY IF EXISTS fixed_asset_categories_insert ON public.fixed_asset_categories;
CREATE POLICY fixed_asset_categories_insert ON public.fixed_asset_categories FOR INSERT TO authenticated WITH CHECK (public.can_manage_fixed_asset_valuation(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_categories_update ON public.fixed_asset_categories;
CREATE POLICY fixed_asset_categories_update ON public.fixed_asset_categories FOR UPDATE TO authenticated USING (public.can_manage_fixed_asset_valuation(enterprise_id)) WITH CHECK (public.can_manage_fixed_asset_valuation(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_categories_delete ON public.fixed_asset_categories;
CREATE POLICY fixed_asset_categories_delete ON public.fixed_asset_categories FOR DELETE TO authenticated USING (public.can_manage_fixed_asset_valuation(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_policy_insert ON public.fixed_asset_policy;
CREATE POLICY fixed_asset_policy_insert ON public.fixed_asset_policy FOR INSERT TO authenticated WITH CHECK (public.can_manage_fixed_asset_valuation(enterprise_id));
DROP POLICY IF EXISTS fixed_asset_policy_update ON public.fixed_asset_policy;
CREATE POLICY fixed_asset_policy_update ON public.fixed_asset_policy FOR UPDATE TO authenticated USING (public.can_manage_fixed_asset_valuation(enterprise_id)) WITH CHECK (public.can_manage_fixed_asset_valuation(enterprise_id));

-- Archivos de activos en almacenamiento: escribir/modificar/borrar = operar
DROP POLICY IF EXISTS fixed_asset_attachments_storage_insert ON storage.objects;
CREATE POLICY fixed_asset_attachments_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fixed-asset-attachments' AND public.can_write_fixed_assets(((storage.foldername(name))[1])::bigint));
DROP POLICY IF EXISTS fixed_asset_attachments_storage_update ON storage.objects;
CREATE POLICY fixed_asset_attachments_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fixed-asset-attachments' AND public.can_write_fixed_assets(((storage.foldername(name))[1])::bigint))
  WITH CHECK (bucket_id = 'fixed-asset-attachments' AND public.can_write_fixed_assets(((storage.foldername(name))[1])::bigint));
DROP POLICY IF EXISTS fixed_asset_attachments_storage_delete ON storage.objects;
CREATE POLICY fixed_asset_attachments_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fixed-asset-attachments' AND public.can_write_fixed_assets(((storage.foldername(name))[1])::bigint));

-- Valoración de un activo: solo edit_accounts, salvo en borrador (corregir y activar)
CREATE OR REPLACE FUNCTION public.enforce_fixed_asset_valuation_permissions()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_valoracion boolean;
  v_baja boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN NEW; END IF;  -- procesos internos sin sesión de usuario
  IF public.can_manage_fixed_asset_valuation(NEW.enterprise_id) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'DRAFT' OR NEW.disposed_at IS NOT NULL OR NEW.disposal_reason_id IS NOT NULL
       OR NEW.disposal_proceeds IS NOT NULL OR NEW.disposal_je_id IS NOT NULL THEN
      RAISE EXCEPTION 'Solo puede crear activos en borrador; la activación y la baja requieren el permiso de editar cuentas' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_baja := NEW.disposed_at IS DISTINCT FROM OLD.disposed_at OR NEW.disposal_reason_id IS DISTINCT FROM OLD.disposal_reason_id
         OR NEW.disposal_proceeds IS DISTINCT FROM OLD.disposal_proceeds OR NEW.disposal_je_id IS DISTINCT FROM OLD.disposal_je_id;
  v_valoracion := round(NEW.acquisition_cost, 2) IS DISTINCT FROM round(OLD.acquisition_cost, 2)
         OR round(NEW.residual_value, 2) IS DISTINCT FROM round(OLD.residual_value, 2)
         OR NEW.useful_life_months IS DISTINCT FROM OLD.useful_life_months
         OR NEW.acquisition_date IS DISTINCT FROM OLD.acquisition_date
         OR NEW.in_service_date IS DISTINCT FROM OLD.in_service_date
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR round(NEW.exchange_rate_at_acquisition, 6) IS DISTINCT FROM round(OLD.exchange_rate_at_acquisition, 6)
         OR round(NEW.original_acquisition_cost, 2) IS DISTINCT FROM round(OLD.original_acquisition_cost, 2)
         OR round(NEW.original_residual_value, 2) IS DISTINCT FROM round(OLD.original_residual_value, 2)
         OR NEW.category_id IS DISTINCT FROM OLD.category_id;

  IF OLD.status = 'DRAFT' THEN
    -- Borrador: se puede corregir y activar (DRAFT → ACTIVE); la baja no
    IF v_baja OR NEW.status NOT IN ('DRAFT', 'ACTIVE') THEN
      RAISE EXCEPTION 'La baja o venta de un activo requiere el permiso de editar cuentas' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Activo ya activado o dado de baja: sin edit_accounts no cambia valoración, estado ni baja
  IF v_valoracion OR v_baja OR NEW.status IS DISTINCT FROM OLD.status OR NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    RAISE EXCEPTION 'Modificar la valoración, el estado o la baja de un activo ya activado requiere el permiso de editar cuentas' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_fixed_asset_valuation_permissions() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_fa_valuation_permissions ON public.fixed_assets;
CREATE TRIGGER trg_fa_valuation_permissions BEFORE INSERT OR UPDATE ON public.fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_fixed_asset_valuation_permissions();

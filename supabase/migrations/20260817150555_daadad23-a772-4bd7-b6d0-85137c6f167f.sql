REVOKE ALL ON FUNCTION public.bulk_insert_accounts(bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_insert_accounts(bigint, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.clear_legacy_import_block(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_legacy_import_block(bigint, text) TO service_role;

REVOKE ALL ON FUNCTION public.reset_legacy_import_data(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_legacy_import_data(bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_enterprise_tenant_reparenting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    IF NOT (
      public.is_super_admin(auth.uid())
      OR public.is_tenant_admin_for(auth.uid(), OLD.tenant_id)
    ) THEN
      RAISE EXCEPTION 'No autorizado para cambiar el tenant de la empresa'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_enterprise_tenant_reparenting ON public.tab_enterprises;
CREATE TRIGGER trg_prevent_enterprise_tenant_reparenting
BEFORE UPDATE ON public.tab_enterprises
FOR EACH ROW
EXECUTE FUNCTION public.prevent_enterprise_tenant_reparenting();
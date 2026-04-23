-- 1) Limpieza de enlaces cruzados existentes en tab_user_enterprises
-- Elimina vínculos donde el tenant del usuario no coincide con el tenant de la empresa.
-- Excluye super admins (pueden estar vinculados a empresas de cualquier tenant).
DELETE FROM public.tab_user_enterprises ue
USING public.tab_users u, public.tab_enterprises e
WHERE ue.user_id = u.id
  AND ue.enterprise_id = e.id
  AND COALESCE(u.is_super_admin, false) = false
  AND u.tenant_id IS DISTINCT FROM e.tenant_id;

-- 2) Función de validación: previene insertar/actualizar enlaces cruzados de tenant
CREATE OR REPLACE FUNCTION public.validate_user_enterprise_tenant_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_tenant_id BIGINT;
  v_enterprise_tenant_id BIGINT;
  v_is_super_admin BOOLEAN;
BEGIN
  SELECT tenant_id, COALESCE(is_super_admin, false)
    INTO v_user_tenant_id, v_is_super_admin
  FROM public.tab_users
  WHERE id = NEW.user_id;

  -- Super admins pueden vincularse a cualquier empresa
  IF v_is_super_admin THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO v_enterprise_tenant_id
  FROM public.tab_enterprises
  WHERE id = NEW.enterprise_id;

  IF v_user_tenant_id IS DISTINCT FROM v_enterprise_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant assignment blocked: user tenant (%) != enterprise tenant (%)',
      v_user_tenant_id, v_enterprise_tenant_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Trigger que aplica la validación en INSERT y UPDATE
DROP TRIGGER IF EXISTS trg_validate_user_enterprise_tenant ON public.tab_user_enterprises;
CREATE TRIGGER trg_validate_user_enterprise_tenant
BEFORE INSERT OR UPDATE OF user_id, enterprise_id
ON public.tab_user_enterprises
FOR EACH ROW
EXECUTE FUNCTION public.validate_user_enterprise_tenant_match();
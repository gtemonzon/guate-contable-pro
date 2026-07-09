
CREATE OR REPLACE FUNCTION public.prevent_tab_users_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role (edge functions with admin client) to modify anything
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
     OR NEW.is_tenant_admin IS DISTINCT FROM OLD.is_tenant_admin
     OR NEW.is_system_user IS DISTINCT FROM OLD.is_system_user
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'No autorizado: no puede modificar campos de privilegios o de tenant en tab_users'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tab_users_priv_esc ON public.tab_users;
CREATE TRIGGER trg_prevent_tab_users_priv_esc
BEFORE UPDATE ON public.tab_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_tab_users_privilege_escalation();

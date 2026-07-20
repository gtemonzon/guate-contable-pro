CREATE OR REPLACE FUNCTION public.prevent_tab_users_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_is_super_admin boolean := false;
  caller_is_tenant_admin boolean := false;
  caller_tenant_id integer;
BEGIN
  -- Allow service_role (edge functions with admin client) to modify anything
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Look up caller privileges
  SELECT is_super_admin, is_tenant_admin, tenant_id
    INTO caller_is_super_admin, caller_is_tenant_admin, caller_tenant_id
  FROM public.tab_users
  WHERE id = auth.uid();

  -- Super admins may change any privilege/tenant field
  IF caller_is_super_admin THEN
    RETURN NEW;
  END IF;

  -- Tenant admins may toggle is_tenant_admin/is_active for users inside their own tenant,
  -- but cannot grant super_admin or move users across tenants.
  IF caller_is_tenant_admin
     AND NEW.is_super_admin IS NOT DISTINCT FROM OLD.is_super_admin
     AND NEW.is_system_user IS NOT DISTINCT FROM OLD.is_system_user
     AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
     AND OLD.tenant_id = caller_tenant_id THEN
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
$function$;
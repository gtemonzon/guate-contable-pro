-- 1) Trabajos de importación de legado: la ruta del archivo no puede apuntar fuera de la carpeta del usuario ni cambiarse después
CREATE OR REPLACE FUNCTION public.enforce_legacy_import_job_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Solo se restringen las sesiones de usuarios; el rol de servicio (función de servidor) y los procesos internos no
  IF auth.role() IS DISTINCT FROM 'authenticated' THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.payload_path IS NOT NULL
       AND (position('..' in NEW.payload_path) > 0 OR NEW.payload_path NOT LIKE auth.uid()::text || '/%') THEN
      RAISE EXCEPTION 'La ruta del archivo de importación debe estar en la carpeta del usuario' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: un usuario no puede redirigir el trabajo a otro archivo, empresa, firma o creador
  IF NEW.payload_path IS DISTINCT FROM OLD.payload_path
     OR NEW.enterprise_id IS DISTINCT FROM OLD.enterprise_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'No se pueden modificar la ruta, la empresa ni el creador de un trabajo de importación' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_legacy_import_job_integrity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_legacy_import_jobs_integrity ON public.tab_legacy_import_jobs;
CREATE TRIGGER trg_legacy_import_jobs_integrity BEFORE INSERT OR UPDATE ON public.tab_legacy_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_legacy_import_job_integrity();

-- 2) Funciones de permisos: solo responden sobre quien las llama (o el rol de servicio); ya no sirven para sondear a otros usuarios
CREATE OR REPLACE FUNCTION public.can_manage_user_enterprise_link(actor_user_id uuid, target_user_id uuid, target_enterprise_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  WITH ent_tenant AS (
    SELECT public.get_enterprise_tenant_id(target_enterprise_id) AS tenant_id
  ), tgt_tenant AS (
    SELECT public.get_user_tenant_id(target_user_id) AS tenant_id
  )
  SELECT
    (auth.role() = 'service_role' OR actor_user_id = auth.uid())
    AND (
      public.is_super_admin(actor_user_id)
      OR EXISTS (
        SELECT 1
        FROM ent_tenant e
        JOIN tgt_tenant t ON true
        WHERE e.tenant_id IS NOT NULL
          AND e.tenant_id = t.tenant_id
          AND public.is_tenant_admin_for(actor_user_id, e.tenant_id)
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.can_post_entries(_user_id uuid, _enterprise_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id
        AND (enterprise_id = _enterprise_id OR enterprise_id IS NULL)
        AND role IN ('super_admin', 'enterprise_admin', 'contador_senior')
      ) OR public.is_super_admin(_user_id)
    )
$function$;

CREATE OR REPLACE FUNCTION public.can_approve_entries(_user_id uuid, _enterprise_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id
        AND (enterprise_id = _enterprise_id OR enterprise_id IS NULL)
        AND role IN ('super_admin', 'enterprise_admin', 'contador_senior')
      ) OR public.is_super_admin(_user_id)
    )
$function$;

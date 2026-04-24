
-- =========================================================
-- 1) Fix privilege escalation in is_admin_for_enterprise
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_admin_for_enterprise(_user_id uuid, _enterprise_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND enterprise_id = _enterprise_id
      AND role IN ('super_admin', 'enterprise_admin')
  ) OR public.is_super_admin(_user_id)
$function$;

-- Prevent future NULL enterprise_id rows for enterprise_admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_roles_enterprise_admin_requires_enterprise'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_enterprise_admin_requires_enterprise
      CHECK (
        role <> 'enterprise_admin'::app_role
        OR enterprise_id IS NOT NULL
      ) NOT VALID;
  END IF;
END $$;

-- =========================================================
-- 2) Tighten tab_users SELECT policy
-- =========================================================
DROP POLICY IF EXISTS "Users can view authorized users only" ON public.tab_users;

CREATE POLICY "Users can view authorized users only"
ON public.tab_users
FOR SELECT
USING (
  -- self
  id = auth.uid()
  -- super admins see everyone
  OR public.is_super_admin_bypass(auth.uid())
  -- tenant admins see only non-super-admin users that share at least
  -- one enterprise they have admin rights on
  OR (
    is_super_admin IS NOT TRUE
    AND public.is_tenant_admin_for_bypass(auth.uid(), tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.tab_user_enterprises ue_target
      JOIN public.tab_user_enterprises ue_admin
        ON ue_admin.enterprise_id = ue_target.enterprise_id
      WHERE ue_target.user_id = tab_users.id
        AND ue_admin.user_id  = auth.uid()
        AND ue_admin.role IN ('enterprise_admin', 'admin_empresa')
    )
  )
);

-- =========================================================
-- 3) Lock down deprecated legacy exchange rates
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can read exchange rates" ON public.tab_exchange_rates_legacy;

CREATE POLICY "Only super admins can read legacy exchange rates"
ON public.tab_exchange_rates_legacy
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- =========================================================
-- 4) Server-side enforcement of granular role permissions
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role_permission(
  _user_id uuid,
  _enterprise_id bigint,
  _permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_super_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.enterprise_id = _enterprise_id
        AND ur.role IN ('super_admin', 'enterprise_admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.tab_user_enterprises ue
      JOIN public.tab_role_permissions rp
        ON rp.enterprise_id = ue.enterprise_id
       AND rp.role_name     = ue.role
      WHERE ue.user_id       = _user_id
        AND ue.enterprise_id = _enterprise_id
        AND rp.permission_key = _permission_key
        AND rp.is_enabled     = true
    )
$function$;

-- Trigger that gates sensitive status transitions on journal entries
CREATE OR REPLACE FUNCTION public.enforce_journal_entry_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_required text;
BEGIN
  -- service role / no auth context: skip (server-side jobs)
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- super admins always allowed
  IF public.is_super_admin(v_uid) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_role_permission(v_uid, NEW.enterprise_id, 'create_entries') THEN
      RAISE EXCEPTION 'No tiene permiso para crear partidas contables'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- only police status transitions
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_required := CASE
        WHEN NEW.status IN ('aprobada', 'approved') THEN 'approve_entries'
        WHEN NEW.status IN ('contabilizada', 'posted', 'mayorizada') THEN 'post_entries'
        WHEN NEW.status IN ('anulada', 'voided', 'reversada') THEN 'void_entries'
        ELSE NULL
      END;

      IF v_required IS NOT NULL
         AND NOT public.has_role_permission(v_uid, NEW.enterprise_id, v_required) THEN
        RAISE EXCEPTION 'No tiene permiso para cambiar el estado de la partida (%)' , v_required
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_journal_entry_permissions ON public.tab_journal_entries;

CREATE TRIGGER trg_enforce_journal_entry_permissions
BEFORE INSERT OR UPDATE ON public.tab_journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_journal_entry_permissions();


-- 1. Immutability: restrictive DELETE policies on audit tables
CREATE POLICY "no_delete_tab_audit_log" ON public.tab_audit_log
  AS RESTRICTIVE FOR DELETE TO public USING (false);

CREATE POLICY "no_delete_audit_event_log" ON public.audit_event_log
  AS RESTRICTIVE FOR DELETE TO public USING (false);

CREATE POLICY "no_delete_tab_journal_entry_history" ON public.tab_journal_entry_history
  AS RESTRICTIVE FOR DELETE TO public USING (false);

-- 2. Soft-delete aware enterprise membership check
CREATE OR REPLACE FUNCTION public.user_is_linked_to_enterprise(_user_id uuid, _enterprise_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tab_user_enterprises
    WHERE user_id = _user_id
      AND enterprise_id = _enterprise_id
      AND deleted_at IS NULL
  );
$function$;

-- 3. Tax certificates: scope to user's enterprises, not whole tenant
DROP POLICY IF EXISTS tax_certificates_tenant_read ON public.tab_tax_certificates;
DROP POLICY IF EXISTS tax_certificates_tenant_insert ON public.tab_tax_certificates;
DROP POLICY IF EXISTS tax_certificates_tenant_update_draft ON public.tab_tax_certificates;
DROP POLICY IF EXISTS tax_certificates_tenant_delete_draft ON public.tab_tax_certificates;

CREATE POLICY tax_certificates_enterprise_read ON public.tab_tax_certificates
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY tax_certificates_enterprise_insert ON public.tab_tax_certificates
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
    AND created_by = auth.uid()
  );

CREATE POLICY tax_certificates_enterprise_update_draft ON public.tab_tax_certificates
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
    AND status <> 'posted'
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  );

CREATE POLICY tax_certificates_enterprise_delete_draft ON public.tab_tax_certificates
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
    AND status = 'draft'
  );

DROP POLICY IF EXISTS tax_cert_ingestion_tenant_all ON public.tab_tax_certificate_ingestion_sources;

CREATE POLICY tax_cert_ingestion_enterprise_all ON public.tab_tax_certificate_ingestion_sources
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.user_is_linked_to_enterprise(auth.uid(), enterprise_id)
    AND created_by = auth.uid()
  );

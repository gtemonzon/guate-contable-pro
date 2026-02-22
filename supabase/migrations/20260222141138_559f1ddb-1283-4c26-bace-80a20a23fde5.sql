
CREATE OR REPLACE FUNCTION public.write_audit_event(p_actor_user_id uuid, p_tenant_id bigint, p_enterprise_id bigint, p_entity_type text, p_entity_id bigint, p_action text, p_before_json jsonb DEFAULT NULL::jsonb, p_after_json jsonb DEFAULT NULL::jsonb, p_metadata_json jsonb DEFAULT NULL::jsonb, p_request_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_prev_hash TEXT;
  v_row_hash  TEXT;
  v_payload   TEXT;
BEGIN
  SELECT row_hash INTO v_prev_hash
  FROM public.audit_event_log
  WHERE tenant_id    = p_tenant_id
    AND enterprise_id = p_enterprise_id
    AND entity_type  = p_entity_type
  ORDER BY id DESC
  LIMIT 1;

  v_payload  := COALESCE(v_prev_hash, '')
             || p_entity_type
             || COALESCE(p_entity_id::text, '')
             || p_action
             || COALESCE(p_after_json::text, 'null');
  v_row_hash := encode(digest(v_payload, 'sha256'), 'hex');

  INSERT INTO public.audit_event_log (
    actor_user_id, tenant_id, enterprise_id,
    entity_type, entity_id, action,
    before_json, after_json, metadata_json, request_id,
    prev_row_hash, row_hash
  ) VALUES (
    p_actor_user_id, p_tenant_id, p_enterprise_id,
    p_entity_type, p_entity_id, p_action,
    p_before_json, p_after_json, p_metadata_json, p_request_id,
    v_prev_hash, v_row_hash
  );
END;
$function$;

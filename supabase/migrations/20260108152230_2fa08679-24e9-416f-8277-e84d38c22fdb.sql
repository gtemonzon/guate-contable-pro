-- Fix ambiguous column reference in initialize_default_permissions function
CREATE OR REPLACE FUNCTION public.initialize_default_permissions(p_enterprise_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  default_permissions JSONB := '{
    "enterprise_admin": {
      "manage_users": true,
      "manage_enterprises": true,
      "access_configuration": true,
      "view_accounts": true,
      "edit_accounts": true,
      "create_entries": true,
      "approve_entries": true,
      "post_entries": true,
      "import_data": true,
      "generate_declarations": true,
      "bank_reconciliation": true,
      "manage_tax_forms": true,
      "view_reports": true,
      "export_reports": true
    },
    "contador_senior": {
      "manage_users": false,
      "manage_enterprises": false,
      "access_configuration": false,
      "view_accounts": true,
      "edit_accounts": true,
      "create_entries": true,
      "approve_entries": true,
      "post_entries": true,
      "import_data": true,
      "generate_declarations": true,
      "bank_reconciliation": true,
      "manage_tax_forms": true,
      "view_reports": true,
      "export_reports": true
    },
    "auxiliar_contable": {
      "manage_users": false,
      "manage_enterprises": false,
      "access_configuration": false,
      "view_accounts": true,
      "edit_accounts": false,
      "create_entries": true,
      "approve_entries": false,
      "post_entries": false,
      "import_data": true,
      "generate_declarations": false,
      "bank_reconciliation": false,
      "manage_tax_forms": false,
      "view_reports": true,
      "export_reports": true
    },
    "cliente": {
      "manage_users": false,
      "manage_enterprises": false,
      "access_configuration": false,
      "view_accounts": true,
      "edit_accounts": false,
      "create_entries": false,
      "approve_entries": false,
      "post_entries": false,
      "import_data": false,
      "generate_declarations": false,
      "bank_reconciliation": false,
      "manage_tax_forms": false,
      "view_reports": true,
      "export_reports": true
    }
  }'::jsonb;
  v_role_name TEXT;
  v_perm_key TEXT;
  v_perm_value BOOLEAN;
BEGIN
  -- Iterar sobre cada rol
  FOR v_role_name IN SELECT jsonb_object_keys(default_permissions)
  LOOP
    -- Iterar sobre cada permiso del rol
    FOR v_perm_key, v_perm_value IN 
      SELECT key, value::boolean 
      FROM jsonb_each_text(default_permissions->v_role_name)
    LOOP
      INSERT INTO public.tab_role_permissions (enterprise_id, role_name, permission_key, is_enabled)
      VALUES (p_enterprise_id, v_role_name, v_perm_key, v_perm_value)
      ON CONFLICT (enterprise_id, role_name, permission_key) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$function$;
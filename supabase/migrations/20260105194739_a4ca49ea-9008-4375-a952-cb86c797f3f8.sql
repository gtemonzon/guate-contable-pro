-- Crear tabla para almacenar permisos personalizables por rol y empresa
CREATE TABLE public.tab_role_permissions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  enterprise_id BIGINT REFERENCES public.tab_enterprises(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  permission_key TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(enterprise_id, role_name, permission_key)
);

-- Habilitar RLS
ALTER TABLE public.tab_role_permissions ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios pueden ver permisos de empresas a las que tienen acceso
CREATE POLICY "Users can view permissions for their enterprises"
ON public.tab_role_permissions
FOR SELECT
TO authenticated
USING (
  enterprise_id IN (
    SELECT enterprise_id FROM public.tab_user_enterprises 
    WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);

-- Política: Solo admins pueden modificar permisos
CREATE POLICY "Admins can manage permissions"
ON public.tab_role_permissions
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tab_user_enterprises 
    WHERE user_id = auth.uid() 
    AND enterprise_id = tab_role_permissions.enterprise_id 
    AND role IN ('admin_empresa', 'enterprise_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tab_user_enterprises 
    WHERE user_id = auth.uid() 
    AND enterprise_id = tab_role_permissions.enterprise_id 
    AND role IN ('admin_empresa', 'enterprise_admin')
  )
  OR EXISTS (
    SELECT 1 FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);

-- Función para inicializar permisos por defecto para una empresa
CREATE OR REPLACE FUNCTION public.initialize_default_permissions(p_enterprise_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  role_name TEXT;
  perm_key TEXT;
  perm_value BOOLEAN;
BEGIN
  -- Iterar sobre cada rol
  FOR role_name IN SELECT jsonb_object_keys(default_permissions)
  LOOP
    -- Iterar sobre cada permiso del rol
    FOR perm_key, perm_value IN 
      SELECT key, value::boolean 
      FROM jsonb_each_text(default_permissions->role_name)
    LOOP
      INSERT INTO public.tab_role_permissions (enterprise_id, role_name, permission_key, is_enabled)
      VALUES (p_enterprise_id, role_name, perm_key, perm_value)
      ON CONFLICT (enterprise_id, role_name, permission_key) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- Trigger para inicializar permisos cuando se crea una empresa
CREATE OR REPLACE FUNCTION public.trigger_initialize_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.initialize_default_permissions(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_enterprise_created_init_permissions
  AFTER INSERT ON public.tab_enterprises
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_initialize_permissions();
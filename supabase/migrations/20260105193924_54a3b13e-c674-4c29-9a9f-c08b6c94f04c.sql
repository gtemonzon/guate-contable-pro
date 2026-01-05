-- Actualizar el check constraint para permitir los nuevos roles
ALTER TABLE tab_user_enterprises DROP CONSTRAINT IF EXISTS tab_user_enterprises_role_check;

ALTER TABLE tab_user_enterprises ADD CONSTRAINT tab_user_enterprises_role_check 
CHECK (role = ANY (ARRAY[
  'admin_empresa'::text, 
  'contador'::text, 
  'auditor'::text, 
  'usuario_basico'::text,
  'enterprise_admin'::text,
  'contador_senior'::text,
  'auxiliar_contable'::text,
  'cliente'::text,
  'super_admin'::text,
  'accountant'::text,
  'viewer'::text
]));
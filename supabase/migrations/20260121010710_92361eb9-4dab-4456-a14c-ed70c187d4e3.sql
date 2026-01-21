-- FASE 1: Crear tabla tab_tenants
CREATE TABLE public.tab_tenants (
  id BIGSERIAL PRIMARY KEY,
  tenant_code TEXT UNIQUE NOT NULL,
  tenant_name TEXT NOT NULL,
  subdomain TEXT UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1e40af',
  secondary_color TEXT DEFAULT '#3b82f6',
  contact_email TEXT,
  contact_phone TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  max_enterprises INTEGER DEFAULT 10,
  max_users INTEGER DEFAULT 5,
  plan_type TEXT DEFAULT 'basic',
  plan_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar tenant inicial "Estuardo" con todos los datos actuales
INSERT INTO public.tab_tenants (tenant_code, tenant_name, subdomain, contact_email)
VALUES ('ESTUARDO', 'Oficina Contable Estuardo', 'estuardo', 'gtemonzon@gmail.com');

-- FASE 2: Agregar columnas a tab_users
ALTER TABLE public.tab_users 
ADD COLUMN tenant_id BIGINT REFERENCES public.tab_tenants(id),
ADD COLUMN is_tenant_admin BOOLEAN DEFAULT false;

-- Migrar todos los usuarios existentes al tenant "Estuardo" (id=1)
UPDATE public.tab_users SET tenant_id = 1;

-- Hacer tenant_id NOT NULL después de migrar
ALTER TABLE public.tab_users ALTER COLUMN tenant_id SET NOT NULL;

-- FASE 3: Agregar tenant_id a tab_enterprises
ALTER TABLE public.tab_enterprises 
ADD COLUMN tenant_id BIGINT REFERENCES public.tab_tenants(id);

-- Migrar todas las empresas existentes al tenant "Estuardo" (id=1)
UPDATE public.tab_enterprises SET tenant_id = 1;

-- Hacer tenant_id NOT NULL después de migrar
ALTER TABLE public.tab_enterprises ALTER COLUMN tenant_id SET NOT NULL;

-- FASE 4: Crear funciones de seguridad
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(user_uuid UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.tab_users WHERE id = user_uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin_for(user_uuid UUID, check_tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tab_users 
    WHERE id = user_uuid 
    AND tenant_id = check_tenant_id 
    AND is_tenant_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_tenant(user_uuid UUID, check_tenant_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.is_super_admin(user_uuid)
    OR (SELECT tenant_id FROM public.tab_users WHERE id = user_uuid) = check_tenant_id;
$$;

-- FASE 5: RLS para tab_tenants
ALTER TABLE public.tab_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage all tenants"
ON public.tab_tenants
FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own tenant"
ON public.tab_tenants
FOR SELECT
USING (
  id = public.get_user_tenant_id(auth.uid())
  OR public.is_super_admin(auth.uid())
);

-- FASE 6: Actualizar RLS para tab_enterprises
DROP POLICY IF EXISTS "Authenticated users can view their enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Authenticated users can insert enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Authenticated users can update their enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Authenticated users can delete their enterprises" ON public.tab_enterprises;

CREATE POLICY "Users can view enterprises in their tenant"
ON public.tab_enterprises
FOR SELECT
USING (
  public.can_access_tenant(auth.uid(), tenant_id)
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin_for(auth.uid(), tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises 
      WHERE enterprise_id = tab_enterprises.id 
      AND user_id = auth.uid()
    )
  )
);

CREATE POLICY "Tenant admins can insert enterprises"
ON public.tab_enterprises
FOR INSERT
WITH CHECK (
  public.can_access_tenant(auth.uid(), tenant_id)
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin_for(auth.uid(), tenant_id)
  )
);

CREATE POLICY "Tenant admins can update enterprises"
ON public.tab_enterprises
FOR UPDATE
USING (
  public.can_access_tenant(auth.uid(), tenant_id)
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin_for(auth.uid(), tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises 
      WHERE enterprise_id = tab_enterprises.id 
      AND user_id = auth.uid()
    )
  )
)
WITH CHECK (
  public.can_access_tenant(auth.uid(), tenant_id)
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin_for(auth.uid(), tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.tab_user_enterprises 
      WHERE enterprise_id = tab_enterprises.id 
      AND user_id = auth.uid()
    )
  )
);

CREATE POLICY "Tenant admins can delete enterprises"
ON public.tab_enterprises
FOR DELETE
USING (
  public.can_access_tenant(auth.uid(), tenant_id)
  AND (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin_for(auth.uid(), tenant_id)
  )
);

-- FASE 7: Actualizar RLS para tab_users
DROP POLICY IF EXISTS "Authenticated users can view own profile or super admins all" ON public.tab_users;

CREATE POLICY "Users can view users in their tenant"
ON public.tab_users
FOR SELECT
USING (
  id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (
    tenant_id = public.get_user_tenant_id(auth.uid()) 
    AND public.is_tenant_admin_for(auth.uid(), tenant_id)
  )
);

-- Crear índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.tab_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enterprises_tenant_id ON public.tab_enterprises(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON public.tab_tenants(subdomain);
CREATE INDEX IF NOT EXISTS idx_tenants_tenant_code ON public.tab_tenants(tenant_code);
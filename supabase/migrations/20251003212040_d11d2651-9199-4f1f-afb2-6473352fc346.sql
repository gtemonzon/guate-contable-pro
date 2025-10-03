-- Reactivar RLS en tab_enterprises con políticas corregidas
ALTER TABLE public.tab_enterprises ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas existentes
DROP POLICY IF EXISTS "Users can create enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Users can view their enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Users can update their enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Super admin can delete enterprises" ON public.tab_enterprises;

-- Crear políticas PERMISSIVE simples y directas
-- Política de INSERT: Cualquier usuario autenticado puede crear empresas
CREATE POLICY "authenticated_users_insert_enterprises" 
ON public.tab_enterprises 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Política de SELECT: Ver empresas vinculadas o si es super admin
CREATE POLICY "authenticated_users_select_enterprises" 
ON public.tab_enterprises 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.tab_user_enterprises 
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id 
    AND tab_user_enterprises.user_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE tab_users.id = auth.uid() 
    AND tab_users.is_super_admin = true
  )
);

-- Política de UPDATE: Actualizar empresas vinculadas o si es super admin
CREATE POLICY "authenticated_users_update_enterprises" 
ON public.tab_enterprises 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.tab_user_enterprises 
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id 
    AND tab_user_enterprises.user_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE tab_users.id = auth.uid() 
    AND tab_users.is_super_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM public.tab_user_enterprises 
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id 
    AND tab_user_enterprises.user_id = auth.uid()
  )
  OR 
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE tab_users.id = auth.uid() 
    AND tab_users.is_super_admin = true
  )
);

-- Política de DELETE: Solo super admin puede eliminar
CREATE POLICY "super_admin_delete_enterprises" 
ON public.tab_enterprises 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE tab_users.id = auth.uid() 
    AND tab_users.is_super_admin = true
  )
);
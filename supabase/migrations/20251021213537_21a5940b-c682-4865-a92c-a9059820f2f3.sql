-- 1. Reemplazar la función is_super_admin para que consulte tab_users directamente
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tab_users
    WHERE id = _user_id
      AND is_super_admin = true
  )
$$;

-- 2. Actualizar políticas RLS de tab_users
-- Eliminar política problemática
DROP POLICY IF EXISTS "Super admins can view all users" ON public.tab_users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.tab_users;

-- Crear nueva política SELECT que usa la función security definer
CREATE POLICY "Super admins can view all users" 
ON public.tab_users 
FOR SELECT 
USING (
  (id = auth.uid()) OR 
  public.is_super_admin(auth.uid())
);

-- Actualizar política UPDATE
DROP POLICY IF EXISTS "Admins update other users" ON public.tab_users;

CREATE POLICY "Super admins update other users" 
ON public.tab_users 
FOR UPDATE 
USING (
  public.is_super_admin(auth.uid()) AND (auth.uid() <> id)
)
WITH CHECK (
  public.is_super_admin(auth.uid()) AND (auth.uid() <> id)
);

-- 3. Actualizar políticas RLS de tab_user_enterprises
DROP POLICY IF EXISTS "Super admin can manage relationships" ON public.tab_user_enterprises;

CREATE POLICY "Super admin can manage relationships" 
ON public.tab_user_enterprises 
FOR UPDATE 
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admin can delete relationships" ON public.tab_user_enterprises;

CREATE POLICY "Super admin can delete relationships" 
ON public.tab_user_enterprises 
FOR DELETE 
USING (public.is_super_admin(auth.uid()));
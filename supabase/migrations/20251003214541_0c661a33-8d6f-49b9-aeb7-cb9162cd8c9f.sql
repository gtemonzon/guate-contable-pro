-- Eliminar todas las políticas existentes y crear una simple para INSERT
DROP POLICY IF EXISTS "allow_all_inserts_temp" ON public.tab_enterprises;
DROP POLICY IF EXISTS "authenticated_users_insert_enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "authenticated_users_select_enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "authenticated_users_update_enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "super_admin_delete_enterprises" ON public.tab_enterprises;

-- Crear políticas simples y claras
CREATE POLICY "users_can_insert_enterprises" 
ON public.tab_enterprises 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "users_can_view_their_enterprises" 
ON public.tab_enterprises 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id
    AND tab_user_enterprises.user_id = auth.uid()
  )
);

CREATE POLICY "users_can_update_their_enterprises" 
ON public.tab_enterprises 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id
    AND tab_user_enterprises.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id
    AND tab_user_enterprises.user_id = auth.uid()
  )
);

CREATE POLICY "users_can_delete_their_enterprises" 
ON public.tab_enterprises 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.enterprise_id = tab_enterprises.id
    AND tab_user_enterprises.user_id = auth.uid()
  )
);
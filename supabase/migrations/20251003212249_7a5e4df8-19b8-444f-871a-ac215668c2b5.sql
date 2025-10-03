-- Temporalmente permitir inserciones a usuarios anónimos también
DROP POLICY IF EXISTS "authenticated_users_insert_enterprises" ON public.tab_enterprises;

CREATE POLICY "allow_all_inserts_temp" 
ON public.tab_enterprises 
FOR INSERT 
WITH CHECK (true);

-- Verificar que la política se aplicó
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  with_check
FROM pg_policies 
WHERE tablename = 'tab_enterprises' AND cmd = 'INSERT';
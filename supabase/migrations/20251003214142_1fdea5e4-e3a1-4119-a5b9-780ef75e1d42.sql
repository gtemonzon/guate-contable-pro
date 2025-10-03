-- Arreglar la política temporal para usuarios autenticados
DROP POLICY IF EXISTS "allow_all_inserts_temp" ON public.tab_enterprises;

CREATE POLICY "allow_all_inserts_temp" 
ON public.tab_enterprises 
FOR INSERT 
TO authenticated
WITH CHECK (true);
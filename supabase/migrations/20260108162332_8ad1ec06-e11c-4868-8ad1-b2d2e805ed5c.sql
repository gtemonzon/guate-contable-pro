-- Política para que los usuarios puedan actualizar su propia información de actividad
CREATE POLICY "Users can update own activity" 
ON public.tab_users 
FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
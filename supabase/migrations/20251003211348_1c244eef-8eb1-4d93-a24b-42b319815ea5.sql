-- Drop existing restrictive policies and create proper permissive ones for tab_enterprises
DROP POLICY IF EXISTS "Users can create enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Users can view their enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Users can update their enterprises" ON public.tab_enterprises;
DROP POLICY IF EXISTS "Super admin can delete enterprises" ON public.tab_enterprises;

-- Create PERMISSIVE policies for tab_enterprises
CREATE POLICY "Users can create enterprises" 
ON public.tab_enterprises 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can view their enterprises" 
ON public.tab_enterprises 
FOR SELECT 
TO authenticated
USING (
  id IN (
    SELECT enterprise_id 
    FROM public.tab_user_enterprises 
    WHERE user_id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);

CREATE POLICY "Users can update their enterprises" 
ON public.tab_enterprises 
FOR UPDATE 
TO authenticated
USING (
  id IN (
    SELECT enterprise_id 
    FROM public.tab_user_enterprises 
    WHERE user_id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);

CREATE POLICY "Super admin can delete enterprises" 
ON public.tab_enterprises 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);

-- Fix tab_user_enterprises policies
DROP POLICY IF EXISTS "Users can create enterprise relationships" ON public.tab_user_enterprises;
DROP POLICY IF EXISTS "Users can view their enterprise relationships" ON public.tab_user_enterprises;
DROP POLICY IF EXISTS "Super admin can manage relationships" ON public.tab_user_enterprises;
DROP POLICY IF EXISTS "Super admin can delete relationships" ON public.tab_user_enterprises;

CREATE POLICY "Users can create enterprise relationships" 
ON public.tab_user_enterprises 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Users can view their enterprise relationships" 
ON public.tab_user_enterprises 
FOR SELECT 
TO authenticated
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);

CREATE POLICY "Super admin can manage relationships" 
ON public.tab_user_enterprises 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);

CREATE POLICY "Super admin can delete relationships" 
ON public.tab_user_enterprises 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  )
);
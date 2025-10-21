-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins view all users" ON public.tab_users;

-- Create new policy that checks is_super_admin field directly
CREATE POLICY "Super admins can view all users" 
ON public.tab_users 
FOR SELECT 
USING (
  (id = auth.uid()) OR 
  (EXISTS (
    SELECT 1 FROM public.tab_users 
    WHERE id = auth.uid() AND is_super_admin = true
  ))
);
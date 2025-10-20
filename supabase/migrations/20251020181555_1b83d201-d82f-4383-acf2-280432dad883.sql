-- Update RLS policies for tab_users to allow admins to manage users
DROP POLICY IF EXISTS "Super admins view all users" ON public.tab_users;

-- Allow admins to view all users
CREATE POLICY "Admins view all users"
ON public.tab_users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR 
  is_super_admin(auth.uid())
);

-- Allow admins to update users (but not themselves to prevent privilege escalation)
CREATE POLICY "Admins update other users"
ON public.tab_users
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid()) AND auth.uid() != id
)
WITH CHECK (
  is_super_admin(auth.uid()) AND auth.uid() != id
);
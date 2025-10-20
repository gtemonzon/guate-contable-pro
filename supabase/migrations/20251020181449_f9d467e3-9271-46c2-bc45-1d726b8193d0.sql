-- Add foreign key relationship between tab_users and user_roles if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_roles_user_id_fkey' 
        AND table_name = 'user_roles'
    ) THEN
        ALTER TABLE public.user_roles
        ADD CONSTRAINT user_roles_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES auth.users(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- Update RLS policies for user_roles to allow admins to manage roles
DROP POLICY IF EXISTS "Super admin can manage relationships" ON public.user_roles;
DROP POLICY IF EXISTS "Super admin can delete relationships" ON public.user_roles;

CREATE POLICY "Super admins and enterprise admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid()) OR 
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'enterprise_admin')
)
WITH CHECK (
  is_super_admin(auth.uid()) OR 
  has_role(auth.uid(), 'super_admin') OR
  has_role(auth.uid(), 'enterprise_admin')
);
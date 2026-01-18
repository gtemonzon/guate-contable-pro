-- Fix 1: tab_users - Ensure explicit authentication requirement
-- Drop and recreate the SELECT policy to explicitly require authentication
DROP POLICY IF EXISTS "Super admins can view all users" ON public.tab_users;

-- Create new policy that explicitly requires authenticated users
CREATE POLICY "Users can view their own profile or super admins all"
ON public.tab_users
FOR SELECT
TO authenticated
USING (
  (id = auth.uid()) OR is_super_admin(auth.uid())
);

-- Fix 2: tab_bank_accounts - Restrict to admins and accountants only
-- Drop the current permissive policy
DROP POLICY IF EXISTS "enterprise_bank_accounts_policy" ON public.tab_bank_accounts;

-- Create role-restricted SELECT policy for bank accounts (sensitive data)
CREATE POLICY "Admins and accountants can view bank accounts"
ON public.tab_bank_accounts
FOR SELECT
TO authenticated
USING (
  -- Super admins can see all
  is_super_admin(auth.uid())
  OR
  -- Enterprise admins and senior accountants can see their enterprise's bank accounts
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
    AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
    AND tab_user_enterprises.role IN ('enterprise_admin', 'contador_senior', 'super_admin')
  )
  OR
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.enterprise_id = tab_bank_accounts.enterprise_id
    AND user_roles.role IN ('super_admin', 'enterprise_admin', 'contador_senior', 'accountant')
  )
);

-- Create INSERT policy for bank accounts (admins only)
CREATE POLICY "Admins can insert bank accounts"
ON public.tab_bank_accounts
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
    AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
    AND tab_user_enterprises.role IN ('enterprise_admin', 'super_admin')
  )
  OR
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.enterprise_id = tab_bank_accounts.enterprise_id
    AND user_roles.role IN ('super_admin', 'enterprise_admin')
  )
);

-- Create UPDATE policy for bank accounts (admins only)
CREATE POLICY "Admins can update bank accounts"
ON public.tab_bank_accounts
FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
    AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
    AND tab_user_enterprises.role IN ('enterprise_admin', 'super_admin')
  )
  OR
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.enterprise_id = tab_bank_accounts.enterprise_id
    AND user_roles.role IN ('super_admin', 'enterprise_admin')
  )
);

-- Create DELETE policy for bank accounts (admins only)
CREATE POLICY "Admins can delete bank accounts"
ON public.tab_bank_accounts
FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR
  EXISTS (
    SELECT 1 FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
    AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
    AND tab_user_enterprises.role IN ('enterprise_admin', 'super_admin')
  )
  OR
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.enterprise_id = tab_bank_accounts.enterprise_id
    AND user_roles.role IN ('super_admin', 'enterprise_admin')
  )
);
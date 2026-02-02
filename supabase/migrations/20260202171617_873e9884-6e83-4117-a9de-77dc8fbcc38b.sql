-- Fix: users_table_public_exposure
-- Tighten tab_users SELECT policy to only expose minimal necessary data to non-admin users
-- The current policy allows enterprise admins to see full user profiles which includes email

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view authorized users only" ON public.tab_users;

-- Create more restrictive policy:
-- 1. Users can always see their own full profile
-- 2. Super admins can see all users
-- 3. Tenant admins can see users in their tenant
-- 4. Enterprise admins can only see user_id and full_name of users in shared enterprises (not email)
-- Since RLS can't do column-level restrictions, we'll keep the structure but document that 
-- sensitive queries should use views. For now, keep enterprise admins from seeing other users entirely.
CREATE POLICY "Users can view authorized users only"
ON public.tab_users
FOR SELECT
USING (
  -- Users can always see their own profile
  id = auth.uid()
  -- Super admins can see all users
  OR is_super_admin_bypass(auth.uid())
  -- Tenant admins can see all users in their tenant
  OR is_tenant_admin_for_bypass(auth.uid(), tenant_id)
);

-- Note: Removed the enterprise_admin subquery that allowed enterprise admins to see 
-- other users' full profiles. Enterprise admins should use admin tools or dedicated 
-- views that expose only necessary fields (id, full_name) for user selection.

-- Fix: bank_accounts_sensitive_exposure
-- The current policy allows 'contador_senior' to view bank accounts which is correct
-- per business requirements (senior accountants need this access for bank reconciliation).
-- However, we should ensure 'auxiliar_contable' and 'cliente' roles definitely cannot access.

-- Drop existing SELECT policy for bank accounts
DROP POLICY IF EXISTS "Admins and accountants can view bank accounts" ON public.tab_bank_accounts;

-- Create stricter policy - only super_admin, enterprise_admin, and contador_senior can view
-- Remove the user_roles check since we use tab_user_enterprises for role management
CREATE POLICY "Only admins and senior accountants can view bank accounts"
ON public.tab_bank_accounts
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
      AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
      AND tab_user_enterprises.role IN ('enterprise_admin', 'contador_senior')
  )
);

-- Also update INSERT policy to be consistent
DROP POLICY IF EXISTS "Admins can insert bank accounts" ON public.tab_bank_accounts;

CREATE POLICY "Only admins can insert bank accounts"
ON public.tab_bank_accounts
FOR INSERT
WITH CHECK (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
      AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
      AND tab_user_enterprises.role = 'enterprise_admin'
  )
);

-- Update UPDATE policy
DROP POLICY IF EXISTS "Admins can update bank accounts" ON public.tab_bank_accounts;

CREATE POLICY "Only admins can update bank accounts"
ON public.tab_bank_accounts
FOR UPDATE
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
      AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
      AND tab_user_enterprises.role = 'enterprise_admin'
  )
);

-- Update DELETE policy  
DROP POLICY IF EXISTS "Admins can delete bank accounts" ON public.tab_bank_accounts;

CREATE POLICY "Only admins can delete bank accounts"
ON public.tab_bank_accounts
FOR DELETE
USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM tab_user_enterprises
    WHERE tab_user_enterprises.user_id = auth.uid()
      AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
      AND tab_user_enterprises.role = 'enterprise_admin'
  )
);
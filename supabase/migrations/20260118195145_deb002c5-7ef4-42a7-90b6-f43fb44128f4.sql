-- Fix 1: tab_users - Add explicit authentication requirement
-- The current policy uses auth.uid() but doesn't explicitly require authentication
-- Drop and recreate to use TO authenticated clause

DROP POLICY IF EXISTS "Users can view their own profile or super admins all" ON public.tab_users;

CREATE POLICY "Authenticated users can view own profile or super admins all"
ON public.tab_users
FOR SELECT
TO authenticated
USING (
  (id = auth.uid()) OR is_super_admin(auth.uid())
);

-- Fix 2: tab_enterprises - Ensure all policies explicitly require authentication
-- Drop existing SELECT policy and recreate with TO authenticated

DROP POLICY IF EXISTS "users_can_view_their_enterprises" ON public.tab_enterprises;

CREATE POLICY "Authenticated users can view their enterprises"
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

-- Also fix the INSERT policy to require authentication
DROP POLICY IF EXISTS "users_can_insert_enterprises" ON public.tab_enterprises;

CREATE POLICY "Authenticated users can insert enterprises"
ON public.tab_enterprises
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Fix UPDATE policy to be explicit about authentication
DROP POLICY IF EXISTS "users_can_update_their_enterprises" ON public.tab_enterprises;

CREATE POLICY "Authenticated users can update their enterprises"
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

-- Fix DELETE policy to be explicit about authentication
DROP POLICY IF EXISTS "users_can_delete_their_enterprises" ON public.tab_enterprises;

CREATE POLICY "Authenticated users can delete their enterprises"
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
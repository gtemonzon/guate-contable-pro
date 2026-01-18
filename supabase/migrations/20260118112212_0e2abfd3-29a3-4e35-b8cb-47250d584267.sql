-- Fix permissive INSERT policy on tab_user_enterprises
-- This policy allows any authenticated user to insert relationships,
-- which could let users link themselves to any enterprise without authorization.
-- The fix restricts users to only create relationships for their own user_id.

DROP POLICY IF EXISTS "Users can create enterprise relationships" ON tab_user_enterprises;

CREATE POLICY "Users can create enterprise relationships" 
ON tab_user_enterprises 
FOR INSERT 
TO authenticated
WITH CHECK (user_id = auth.uid());
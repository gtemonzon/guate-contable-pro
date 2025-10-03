-- Re-enable RLS on tab_enterprises
ALTER TABLE tab_enterprises ENABLE ROW LEVEL SECURITY;

-- The policies are already correct, the issue was that auth.uid() was returning NULL
-- This should work now that we've verified the enterprise creation works
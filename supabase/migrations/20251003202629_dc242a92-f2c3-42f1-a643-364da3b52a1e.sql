-- Drop existing policy
DROP POLICY IF EXISTS user_enterprises_policy ON tab_enterprises;

-- Create separate policies for different operations
-- Allow authenticated users to insert new enterprises
CREATE POLICY "Users can create enterprises" ON tab_enterprises
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow users to view enterprises they have access to
CREATE POLICY "Users can view their enterprises" ON tab_enterprises
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tab_users 
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Allow users to update enterprises they have access to
CREATE POLICY "Users can update their enterprises" ON tab_enterprises
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT enterprise_id FROM tab_user_enterprises 
      WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM tab_users 
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Allow users to delete enterprises they have access to (only super admin)
CREATE POLICY "Super admin can delete enterprises" ON tab_enterprises
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tab_users 
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Enable RLS on tab_user_enterprises
ALTER TABLE tab_user_enterprises ENABLE ROW LEVEL SECURITY;

-- Allow users to view their enterprise relationships
CREATE POLICY "Users can view their enterprise relationships" ON tab_user_enterprises
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM tab_users 
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

-- Allow users to create their own enterprise relationships
CREATE POLICY "Users can create enterprise relationships" ON tab_user_enterprises
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only super admin can update/delete relationships
CREATE POLICY "Super admin can manage relationships" ON tab_user_enterprises
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tab_users 
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "Super admin can delete relationships" ON tab_user_enterprises
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tab_users 
      WHERE id = auth.uid() AND is_super_admin = true
    )
  );
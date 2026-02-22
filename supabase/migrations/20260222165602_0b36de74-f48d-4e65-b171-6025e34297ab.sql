
-- Fix: tab_bank_accounts RLS policies to also allow 'admin_empresa' role (legacy role name)
DROP POLICY IF EXISTS "Only admins and senior accountants can view bank accounts" ON public.tab_bank_accounts;
CREATE POLICY "Only admins and senior accountants can view bank accounts"
  ON public.tab_bank_accounts FOR SELECT
  USING (
    is_super_admin(auth.uid()) OR (
      EXISTS (
        SELECT 1 FROM tab_user_enterprises
        WHERE tab_user_enterprises.user_id = auth.uid()
          AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
          AND tab_user_enterprises.role = ANY (ARRAY['enterprise_admin','admin_empresa','contador_senior'])
      )
    )
  );

DROP POLICY IF EXISTS "Only admins can insert bank accounts" ON public.tab_bank_accounts;
CREATE POLICY "Only admins can insert bank accounts"
  ON public.tab_bank_accounts FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid()) OR (
      EXISTS (
        SELECT 1 FROM tab_user_enterprises
        WHERE tab_user_enterprises.user_id = auth.uid()
          AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
          AND tab_user_enterprises.role = ANY (ARRAY['enterprise_admin','admin_empresa'])
      )
    )
  );

DROP POLICY IF EXISTS "Only admins can update bank accounts" ON public.tab_bank_accounts;
CREATE POLICY "Only admins can update bank accounts"
  ON public.tab_bank_accounts FOR UPDATE
  USING (
    is_super_admin(auth.uid()) OR (
      EXISTS (
        SELECT 1 FROM tab_user_enterprises
        WHERE tab_user_enterprises.user_id = auth.uid()
          AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
          AND tab_user_enterprises.role = ANY (ARRAY['enterprise_admin','admin_empresa'])
      )
    )
  );

DROP POLICY IF EXISTS "Only admins can delete bank accounts" ON public.tab_bank_accounts;
CREATE POLICY "Only admins can delete bank accounts"
  ON public.tab_bank_accounts FOR DELETE
  USING (
    is_super_admin(auth.uid()) OR (
      EXISTS (
        SELECT 1 FROM tab_user_enterprises
        WHERE tab_user_enterprises.user_id = auth.uid()
          AND tab_user_enterprises.enterprise_id = tab_bank_accounts.enterprise_id
          AND tab_user_enterprises.role = ANY (ARRAY['enterprise_admin','admin_empresa'])
      )
    )
  );

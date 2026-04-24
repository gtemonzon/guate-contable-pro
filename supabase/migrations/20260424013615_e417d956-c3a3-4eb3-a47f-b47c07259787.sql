DROP POLICY IF EXISTS "Enterprise reconciliations" ON public.tab_bank_reconciliations;
CREATE POLICY "Enterprise reconciliations" ON public.tab_bank_reconciliations
  FOR ALL
  USING (bank_account_id IN (
    SELECT tab_bank_accounts.id FROM tab_bank_accounts
    WHERE tab_bank_accounts.enterprise_id IN (
      SELECT tab_user_enterprises.enterprise_id FROM tab_user_enterprises
      WHERE tab_user_enterprises.user_id = auth.uid()
    )
  ))
  WITH CHECK (bank_account_id IN (
    SELECT tab_bank_accounts.id FROM tab_bank_accounts
    WHERE tab_bank_accounts.enterprise_id IN (
      SELECT tab_user_enterprises.enterprise_id FROM tab_user_enterprises
      WHERE tab_user_enterprises.user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "Enterprise bank movements" ON public.tab_bank_movements;
CREATE POLICY "Enterprise bank movements" ON public.tab_bank_movements
  FOR ALL
  USING (bank_account_id IN (
    SELECT tab_bank_accounts.id FROM tab_bank_accounts
    WHERE tab_bank_accounts.enterprise_id IN (
      SELECT tab_user_enterprises.enterprise_id FROM tab_user_enterprises
      WHERE tab_user_enterprises.user_id = auth.uid()
    )
  ))
  WITH CHECK (bank_account_id IN (
    SELECT tab_bank_accounts.id FROM tab_bank_accounts
    WHERE tab_bank_accounts.enterprise_id IN (
      SELECT tab_user_enterprises.enterprise_id FROM tab_user_enterprises
      WHERE tab_user_enterprises.user_id = auth.uid()
    )
  ));
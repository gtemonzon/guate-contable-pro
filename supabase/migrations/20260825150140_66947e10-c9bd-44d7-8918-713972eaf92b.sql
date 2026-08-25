-- 1. Standardize collection tracking delete on tab_user_enterprises membership + admin
DROP POLICY IF EXISTS collection_tracking_delete_admin ON public.tab_collection_tracking;
CREATE POLICY collection_tracking_delete_admin
ON public.tab_collection_tracking
FOR DELETE
TO authenticated
USING (
  enterprise_id IN (
    SELECT tue.enterprise_id FROM public.tab_user_enterprises tue
    WHERE tue.user_id = auth.uid()
  )
  AND public.is_admin_for_enterprise(auth.uid(), enterprise_id)
);

-- 2. Bank movements: restrict to authenticated, require valid bank account link and consistent enterprise
DROP POLICY IF EXISTS "Enterprise bank movements" ON public.tab_bank_movements;
CREATE POLICY "Enterprise bank movements"
ON public.tab_bank_movements
FOR ALL
TO authenticated
USING (
  bank_account_id IS NOT NULL
  AND bank_account_id IN (
    SELECT ba.id FROM public.tab_bank_accounts ba
    WHERE ba.enterprise_id IN (
      SELECT tue.enterprise_id FROM public.tab_user_enterprises tue
      WHERE tue.user_id = auth.uid()
    )
  )
  AND (
    enterprise_id IS NULL
    OR enterprise_id IN (
      SELECT tue.enterprise_id FROM public.tab_user_enterprises tue
      WHERE tue.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  bank_account_id IS NOT NULL
  AND bank_account_id IN (
    SELECT ba.id FROM public.tab_bank_accounts ba
    WHERE ba.enterprise_id IN (
      SELECT tue.enterprise_id FROM public.tab_user_enterprises tue
      WHERE tue.user_id = auth.uid()
    )
  )
  AND (
    enterprise_id IS NULL
    OR enterprise_id IN (
      SELECT tue.enterprise_id FROM public.tab_user_enterprises tue
      WHERE tue.user_id = auth.uid()
    )
  )
);

-- 3. Reference/catalog tables: require an authenticated session instead of blanket USING (true)
DROP POLICY IF EXISTS "Authenticated users can read currencies" ON public.tab_currencies;
CREATE POLICY "Authenticated users can read currencies"
ON public.tab_currencies FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view FEL document types" ON public.tab_fel_document_types;
CREATE POLICY "Authenticated users can view FEL document types"
ON public.tab_fel_document_types FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS isr_categories_read_authenticated ON public.tab_isr_income_categories;
CREATE POLICY isr_categories_read_authenticated
ON public.tab_isr_income_categories FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can read taxpayer cache" ON public.taxpayer_cache;
CREATE POLICY "Authenticated users can read taxpayer cache"
ON public.taxpayer_cache FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

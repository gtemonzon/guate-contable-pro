CREATE OR REPLACE FUNCTION public.is_active_app_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tab_users u
    WHERE u.id = auth.uid() AND COALESCE(u.is_active, true) = true
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_app_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_app_user() TO authenticated, service_role;

-- tab_currencies
DROP POLICY IF EXISTS "Authenticated users can read currencies" ON public.tab_currencies;
CREATE POLICY "Active app users can read currencies"
ON public.tab_currencies FOR SELECT TO authenticated
USING (public.is_active_app_user());

-- tab_fel_document_types
DROP POLICY IF EXISTS "Authenticated users can view FEL document types" ON public.tab_fel_document_types;
CREATE POLICY "Active app users can view FEL document types"
ON public.tab_fel_document_types FOR SELECT TO authenticated
USING (public.is_active_app_user());

-- tab_isr_income_categories
DROP POLICY IF EXISTS "isr_categories_read_authenticated" ON public.tab_isr_income_categories;
CREATE POLICY "isr_categories_read_active_app_users"
ON public.tab_isr_income_categories FOR SELECT TO authenticated
USING (public.is_active_app_user());

-- tab_journal_entry_prefixes
DROP POLICY IF EXISTS "Authenticated users can view journal entry prefixes" ON public.tab_journal_entry_prefixes;
CREATE POLICY "Active app users can view journal entry prefixes"
ON public.tab_journal_entry_prefixes FOR SELECT TO authenticated
USING (public.is_active_app_user());

-- fixed_asset_disposal_reasons
DROP POLICY IF EXISTS "fixed_asset_disposal_reasons_select" ON public.fixed_asset_disposal_reasons;
CREATE POLICY "fixed_asset_disposal_reasons_select"
ON public.fixed_asset_disposal_reasons FOR SELECT TO authenticated
USING (public.is_active_app_user());
REVOKE SELECT ON public.fixed_asset_disposal_reasons FROM anon;

-- taxpayer_cache
DROP POLICY IF EXISTS "Authenticated users can read taxpayer cache" ON public.taxpayer_cache;
DROP POLICY IF EXISTS "Authenticated users can insert taxpayer cache" ON public.taxpayer_cache;
DROP POLICY IF EXISTS "Authenticated users can update taxpayer cache" ON public.taxpayer_cache;

CREATE POLICY "Active app users can read taxpayer cache"
ON public.taxpayer_cache FOR SELECT TO authenticated
USING (public.is_active_app_user());

CREATE POLICY "Active app users can insert taxpayer cache"
ON public.taxpayer_cache FOR INSERT TO authenticated
WITH CHECK (public.is_active_app_user());

CREATE POLICY "Active app users can update taxpayer cache"
ON public.taxpayer_cache FOR UPDATE TO authenticated
USING (public.is_active_app_user())
WITH CHECK (public.is_active_app_user());
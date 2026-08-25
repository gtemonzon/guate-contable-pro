DROP POLICY IF EXISTS "Authenticated users can view journal entry prefixes" ON public.tab_journal_entry_prefixes;
CREATE POLICY "Authenticated users can view journal entry prefixes"
ON public.tab_journal_entry_prefixes FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Super admins can insert journal entry prefixes" ON public.tab_journal_entry_prefixes;
CREATE POLICY "Super admins can insert journal entry prefixes"
ON public.tab_journal_entry_prefixes FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can update journal entry prefixes" ON public.tab_journal_entry_prefixes;
CREATE POLICY "Super admins can update journal entry prefixes"
ON public.tab_journal_entry_prefixes FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can delete journal entry prefixes" ON public.tab_journal_entry_prefixes;
CREATE POLICY "Super admins can delete journal entry prefixes"
ON public.tab_journal_entry_prefixes FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

-- 1. fixed_asset_depreciation_schedule: deny DELETE (depreciation records are immutable once posted)
CREATE POLICY "depreciation_schedule_no_delete"
  ON public.fixed_asset_depreciation_schedule
  FOR DELETE
  USING (false);

-- 2. fixed_asset_disposal_reasons: allow INSERT for super admins only (reference table)
CREATE POLICY "fixed_asset_disposal_reasons_insert"
  ON public.fixed_asset_disposal_reasons
  FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Also add UPDATE and DELETE deny policies for reference table
CREATE POLICY "fixed_asset_disposal_reasons_update"
  ON public.fixed_asset_disposal_reasons
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "fixed_asset_disposal_reasons_delete"
  ON public.fixed_asset_disposal_reasons
  FOR DELETE
  USING (public.is_super_admin(auth.uid()));

-- 3. fixed_asset_event_log: deny UPDATE and DELETE (event log is append-only)
CREATE POLICY "asset_event_log_no_update"
  ON public.fixed_asset_event_log
  FOR UPDATE
  USING (false);

CREATE POLICY "asset_event_log_no_delete"
  ON public.fixed_asset_event_log
  FOR DELETE
  USING (false);

-- 4. fixed_asset_policy: deny DELETE (policy config should not be deleted, only updated)
CREATE POLICY "fixed_asset_policy_no_delete"
  ON public.fixed_asset_policy
  FOR DELETE
  USING (false);

-- 5. tab_journal_entry_metadata_changes: deny UPDATE and DELETE (audit log is immutable)
CREATE POLICY "metadata_changes_no_update"
  ON public.tab_journal_entry_metadata_changes
  FOR UPDATE
  USING (false);

CREATE POLICY "metadata_changes_no_delete"
  ON public.tab_journal_entry_metadata_changes
  FOR DELETE
  USING (false);

-- 6. tab_purchase_journal_links: deny UPDATE (use delete+insert model)
CREATE POLICY "purchase_journal_links_no_update"
  ON public.tab_purchase_journal_links
  FOR UPDATE
  USING (false);

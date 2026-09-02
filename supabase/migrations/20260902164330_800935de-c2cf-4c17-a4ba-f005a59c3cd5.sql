CREATE POLICY "fixed_asset_attachments_storage_select" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'fixed-asset-attachments'
    AND (
      public.is_super_admin(auth.uid())
      OR public.user_is_linked_to_enterprise(auth.uid(), (storage.foldername(name))[1]::BIGINT)
    )
  );

CREATE POLICY "fixed_asset_attachments_storage_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'fixed-asset-attachments'
    AND (
      public.is_super_admin(auth.uid())
      OR public.user_is_linked_to_enterprise(auth.uid(), (storage.foldername(name))[1]::BIGINT)
    )
  );

CREATE POLICY "fixed_asset_attachments_storage_update" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'fixed-asset-attachments'
    AND (
      public.is_super_admin(auth.uid())
      OR public.user_is_linked_to_enterprise(auth.uid(), (storage.foldername(name))[1]::BIGINT)
    )
  ) WITH CHECK (
    bucket_id = 'fixed-asset-attachments'
    AND (
      public.is_super_admin(auth.uid())
      OR public.user_is_linked_to_enterprise(auth.uid(), (storage.foldername(name))[1]::BIGINT)
    )
  );

CREATE POLICY "fixed_asset_attachments_storage_delete" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'fixed-asset-attachments'
    AND (
      public.is_super_admin(auth.uid())
      OR public.user_is_linked_to_enterprise(auth.uid(), (storage.foldername(name))[1]::BIGINT)
    )
  );
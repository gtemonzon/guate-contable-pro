-- 1) Column-level UPDATE restrictions on tab_users
REVOKE UPDATE ON public.tab_users FROM authenticated;
GRANT UPDATE (full_name, last_activity_at, last_enterprise_id, current_enterprise_name) ON public.tab_users TO authenticated;
GRANT ALL ON public.tab_users TO service_role;

-- 2) Exact storage path matching for ticket attachments
ALTER TABLE public.ticket_attachments ADD COLUMN IF NOT EXISTS storage_path text;

UPDATE public.ticket_attachments
SET storage_path = regexp_replace(file_url, '^.*/ticket-attachments/', '')
WHERE storage_path IS NULL
  AND file_url LIKE '%/ticket-attachments/%';

DROP POLICY IF EXISTS "Users view ticket attachments in own tenant" ON storage.objects;

CREATE POLICY "Users view ticket attachments in own tenant"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'ticket-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.ticket_attachments ta
    JOIN public.ticket_messages tm ON tm.id = ta.ticket_message_id
    JOIN public.tickets t ON t.id = tm.ticket_id
    WHERE ta.storage_path = storage.objects.name
      AND (
        public.is_support_agent(auth.uid())
        OR t.tenant_id = public.get_user_tenant_id(auth.uid())
      )
  )
);
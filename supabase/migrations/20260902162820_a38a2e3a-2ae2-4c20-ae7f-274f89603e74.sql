CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe_unread
ON public.tab_notifications (enterprise_id, notification_type, event_date)
WHERE is_read = false;
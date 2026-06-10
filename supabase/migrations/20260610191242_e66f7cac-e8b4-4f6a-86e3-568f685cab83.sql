-- Cleanup stale ISO notifications that were generated under the old "current_month" config.
-- The new config is quarter_end_next_month, so any existing future or recent unread ISO
-- alerts have the wrong event_date and must be regenerated.
DELETE FROM public.tab_notifications
WHERE notification_type IN ('vencimiento_iso', 'vencimiento_iso_trimestral')
  AND is_read = false;
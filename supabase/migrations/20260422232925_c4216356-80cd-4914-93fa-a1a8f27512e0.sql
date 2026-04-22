DELETE FROM tab_notifications
WHERE enterprise_id = 31
  AND notification_type = 'vencimiento_iva_mensual'
  AND event_date < '2026-04-15';
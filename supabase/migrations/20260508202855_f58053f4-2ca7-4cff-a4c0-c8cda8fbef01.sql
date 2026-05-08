UPDATE public.tab_accounting_periods
SET status = 'cerrado', closed_at = now()
WHERE id = 358 AND enterprise_id = 34;
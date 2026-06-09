ALTER TABLE public.tab_enterprise_config
  ADD COLUMN IF NOT EXISTS estimated_cogs_method text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS estimated_cogs_periods integer NOT NULL DEFAULT 3;

ALTER TABLE public.tab_enterprise_config
  DROP CONSTRAINT IF EXISTS tab_enterprise_config_estimated_cogs_method_check;
ALTER TABLE public.tab_enterprise_config
  ADD CONSTRAINT tab_enterprise_config_estimated_cogs_method_check
  CHECK (estimated_cogs_method IN ('disabled','last_period','average_n'));

ALTER TABLE public.tab_enterprise_config
  DROP CONSTRAINT IF EXISTS tab_enterprise_config_estimated_cogs_periods_check;
ALTER TABLE public.tab_enterprise_config
  ADD CONSTRAINT tab_enterprise_config_estimated_cogs_periods_check
  CHECK (estimated_cogs_periods BETWEEN 1 AND 24);
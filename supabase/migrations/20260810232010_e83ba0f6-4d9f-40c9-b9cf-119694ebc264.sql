ALTER TABLE public.tab_tenants
  DROP COLUMN IF EXISTS max_enterprises,
  DROP COLUMN IF EXISTS max_users,
  DROP COLUMN IF EXISTS plan_type;
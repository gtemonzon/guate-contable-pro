
CREATE TABLE public.taxpayer_cache (
  nit TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'SAT FEL Registry',
  last_checked TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.taxpayer_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read from cache
CREATE POLICY "Authenticated users can read taxpayer cache"
ON public.taxpayer_cache FOR SELECT TO authenticated
USING (true);

-- Allow all authenticated users to insert/update cache
CREATE POLICY "Authenticated users can insert taxpayer cache"
ON public.taxpayer_cache FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update taxpayer cache"
ON public.taxpayer_cache FOR UPDATE TO authenticated
USING (true) WITH CHECK (true);

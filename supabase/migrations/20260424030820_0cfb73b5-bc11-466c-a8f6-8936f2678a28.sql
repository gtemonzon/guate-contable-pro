DROP POLICY IF EXISTS "Authenticated users can insert taxpayer cache" ON public.taxpayer_cache;
DROP POLICY IF EXISTS "Authenticated users can update taxpayer cache" ON public.taxpayer_cache;

CREATE POLICY "Authenticated users can insert taxpayer cache"
ON public.taxpayer_cache
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update taxpayer cache"
ON public.taxpayer_cache
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
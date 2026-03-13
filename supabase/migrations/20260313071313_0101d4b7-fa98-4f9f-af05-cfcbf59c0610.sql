CREATE POLICY "No delete on taxpayer_cache"
ON public.taxpayer_cache
FOR DELETE
TO authenticated
USING (false);
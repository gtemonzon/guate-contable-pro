CREATE TABLE public.tmp_desc_fix (
  detail_id bigint PRIMARY KEY,
  descr text NOT NULL,
  stype text NOT NULL,
  sref text
);
GRANT ALL ON public.tmp_desc_fix TO service_role;
ALTER TABLE public.tmp_desc_fix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmp_desc_fix_service_only" ON public.tmp_desc_fix FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON FUNCTION public.reset_legacy_import_data(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_legacy_import_data(bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.reset_legacy_import_data(bigint) TO authenticated;
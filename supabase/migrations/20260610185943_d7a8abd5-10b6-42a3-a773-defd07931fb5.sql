REVOKE EXECUTE ON FUNCTION public.hard_reset_legacy_import_enterprise(bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hard_reset_legacy_import_phase(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_legacy_import_batch(bigint, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hard_reset_legacy_import_enterprise(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.hard_reset_legacy_import_phase(bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_legacy_import_batch(bigint, text, integer) TO service_role;
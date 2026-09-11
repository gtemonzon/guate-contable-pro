REVOKE ALL ON FUNCTION public.purge_old_audit_log(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_audit_log_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_audit_log(integer) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.run_audit_log_purge() TO postgres, service_role;
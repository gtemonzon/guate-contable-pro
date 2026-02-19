
-- Extend write_protected_tables to include tables intentionally
-- lacking certain DML policies because writes are handled via
-- SECURITY DEFINER triggers or service-role only:
--   tab_backup_history    — INSERT via admin only; no UPDATE/DELETE (immutable records)
--   tab_integrity_validations — INSERT only; no UPDATE/DELETE (append-only audit)
--   tab_users             — INSERT via handle_new_user trigger (service role); no client INSERT

DROP VIEW IF EXISTS public.v_rls_coverage;

CREATE VIEW public.v_rls_coverage
WITH (security_invoker = true)
AS
WITH 
  all_tables AS (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  ),
  policy_summary AS (
    SELECT
      tablename,
      ARRAY_AGG(DISTINCT cmd ORDER BY cmd) AS raw_commands,
      COUNT(DISTINCT policyname) AS policy_count,
      bool_or(cmd = 'ALL') AS has_all_policy
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
  ),
  -- Shared global tables — only SELECT needed by authenticated users
  reference_tables(tablename) AS (
    VALUES
      ('tab_currencies'),
      ('tab_exchange_rates'),
      ('tab_fel_document_types'),
      ('tab_journal_entry_prefixes')
  ),
  -- Tables where certain DML commands are intentionally absent for clients:
  -- writes happen via SECURITY DEFINER triggers or service-role functions only.
  write_protected_tables(tablename, reason) AS (
    VALUES
      ('tab_audit_log',             'All writes via audit triggers (SECURITY DEFINER)'),
      ('tab_journal_entry_history', 'All writes via snapshot trigger (SECURITY DEFINER)'),
      ('tab_backup_history',        'INSERT only by admins; no client UPDATE/DELETE (immutable records)'),
      ('tab_integrity_validations', 'INSERT only; no client UPDATE/DELETE (append-only audit records)'),
      ('tab_users',                 'INSERT via handle_new_user trigger (service role); clients cannot self-register')
  )
SELECT
  t.tablename,
  pt.rowsecurity                                          AS rls_enabled,
  COALESCE(ps.policy_count, 0)                           AS policy_count,
  COALESCE(ps.has_all_policy, false)                     AS has_all_policy,
  COALESCE(ps.raw_commands, '{}')                        AS commands_covered,
  CASE WHEN rt.tablename IS NOT NULL THEN true  ELSE false END AS is_reference_table,
  CASE WHEN wp.tablename IS NOT NULL THEN true  ELSE false END AS is_write_protected,
  wp.reason                                               AS write_protected_reason,
  CASE
    WHEN NOT pt.rowsecurity        THEN false
    WHEN ps.policy_count = 0       THEN false
    ELSE true
  END AS is_rls_compliant,
  CASE
    WHEN NOT pt.rowsecurity        THEN 'RLS disabled'
    WHEN ps.policy_count = 0       THEN 'No policies defined'
    WHEN COALESCE(ps.has_all_policy, false) THEN NULL   -- ALL covers everything
    WHEN wp.tablename IS NOT NULL  THEN NULL             -- intentionally restricted
    WHEN rt.tablename IS NOT NULL  THEN                  -- reference tables: only SELECT needed
      CASE WHEN NOT ('SELECT' = ANY(COALESCE(ps.raw_commands, '{}'))) THEN 'Missing SELECT policy' ELSE NULL END
    -- Business tables: need all four DML commands
    WHEN NOT ('SELECT' = ANY(COALESCE(ps.raw_commands, '{}')))  THEN 'Missing SELECT policy'
    WHEN NOT ('INSERT' = ANY(COALESCE(ps.raw_commands, '{}')))  THEN 'Missing INSERT policy'
    WHEN NOT ('UPDATE' = ANY(COALESCE(ps.raw_commands, '{}')))  THEN 'Missing UPDATE policy'
    WHEN NOT ('DELETE' = ANY(COALESCE(ps.raw_commands, '{}')))  THEN 'Missing DELETE policy'
    ELSE NULL
  END AS compliance_gap
FROM all_tables t
JOIN pg_tables pt ON pt.tablename = t.tablename AND pt.schemaname = 'public'
LEFT JOIN policy_summary ps ON ps.tablename = t.tablename
LEFT JOIN reference_tables rt ON rt.tablename = t.tablename
LEFT JOIN write_protected_tables wp ON wp.tablename = t.tablename
ORDER BY is_rls_compliant ASC, t.tablename;

COMMENT ON VIEW public.v_rls_coverage IS
  'Tenant isolation audit view (SECURITY INVOKER). '
  'Returns 0 rows for compliance_gap when the database is fully protected. '
  'ALL policies count as covering SELECT+INSERT+UPDATE+DELETE. '
  'Write-protected tables (triggers/service-role only) are exempt from DML gaps. '
  'CI: SELECT count(*) FROM v_rls_coverage WHERE is_rls_compliant=false OR compliance_gap IS NOT NULL; -- must be 0';

GRANT SELECT ON public.v_rls_coverage TO authenticated;

-- Recreate fail_if_rls_gap
CREATE OR REPLACE FUNCTION public.fail_if_rls_gap()
RETURNS TABLE(
  tablename text,
  rls_enabled boolean,
  policy_count bigint,
  compliance_gap text
)
LANGUAGE sql
SET search_path = public
AS $$
  SELECT tablename, rls_enabled, policy_count, compliance_gap
  FROM public.v_rls_coverage
  WHERE is_rls_compliant = false
     OR compliance_gap IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.fail_if_rls_gap() TO authenticated;

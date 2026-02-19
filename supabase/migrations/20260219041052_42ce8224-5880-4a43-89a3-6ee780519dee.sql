
-- Fix v_rls_coverage: treat 'ALL' policy as covering SELECT, INSERT, UPDATE, DELETE.
-- Tables using ALL-command policies were incorrectly flagged as missing individual commands.

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
      -- Expand ALL into the four concrete commands for gap analysis
      ARRAY_AGG(DISTINCT
        CASE WHEN cmd = 'ALL' THEN 'SELECT' ELSE cmd END
        ORDER BY CASE WHEN cmd = 'ALL' THEN 'SELECT' ELSE cmd END
      ) ||
      ARRAY_AGG(DISTINCT
        CASE WHEN cmd = 'ALL' THEN 'INSERT' ELSE cmd END
        ORDER BY CASE WHEN cmd = 'ALL' THEN 'INSERT' ELSE cmd END
      ) ||
      ARRAY_AGG(DISTINCT
        CASE WHEN cmd = 'ALL' THEN 'UPDATE' ELSE cmd END
        ORDER BY CASE WHEN cmd = 'ALL' THEN 'UPDATE' ELSE cmd END
      ) ||
      ARRAY_AGG(DISTINCT
        CASE WHEN cmd = 'ALL' THEN 'DELETE' ELSE cmd END
        ORDER BY CASE WHEN cmd = 'ALL' THEN 'DELETE' ELSE cmd END
      ) AS commands_covered,
      COUNT(DISTINCT policyname) AS policy_count,
      bool_or(cmd = 'ALL') AS has_all_policy
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
  ),
  reference_tables(tablename) AS (
    VALUES
      ('tab_currencies'),
      ('tab_exchange_rates'),
      ('tab_fel_document_types'),
      ('tab_journal_entry_prefixes')
  ),
  -- Tables intentionally write-protected (trigger/service-role only writes)
  write_protected_tables(tablename) AS (
    VALUES
      ('tab_audit_log'),          -- written only by audit triggers (SECURITY DEFINER)
      ('tab_journal_entry_history') -- written only by snapshot trigger (SECURITY DEFINER)
  )
SELECT
  t.tablename,
  pt.rowsecurity AS rls_enabled,
  COALESCE(ps.policy_count, 0) AS policy_count,
  COALESCE(ps.has_all_policy, false) AS has_all_policy,
  CASE WHEN rt.tablename IS NOT NULL THEN true ELSE false END AS is_reference_table,
  CASE WHEN wp.tablename IS NOT NULL THEN true ELSE false END AS is_write_protected,
  CASE
    WHEN NOT pt.rowsecurity THEN false
    WHEN ps.policy_count = 0 THEN false
    ELSE true
  END AS is_rls_compliant,
  -- Gap analysis: skip if has ALL policy, reference table, or write-protected table
  CASE
    WHEN NOT pt.rowsecurity THEN 'RLS disabled'
    WHEN ps.policy_count = 0 THEN 'No policies defined'
    -- Tables with ALL policy are fully covered
    WHEN COALESCE(ps.has_all_policy, false) THEN NULL
    -- Reference tables only need SELECT
    WHEN rt.tablename IS NOT NULL AND NOT ('SELECT' = ANY(COALESCE(ps.commands_covered, '{}'))) THEN 'Missing SELECT policy'
    WHEN rt.tablename IS NOT NULL THEN NULL
    -- Write-protected tables intentionally lack INSERT/UPDATE/DELETE client policies
    WHEN wp.tablename IS NOT NULL THEN NULL
    -- Business tables need all four commands
    WHEN NOT ('SELECT' = ANY(COALESCE(ps.commands_covered, '{}'))) THEN 'Missing SELECT policy'
    WHEN NOT ('INSERT' = ANY(COALESCE(ps.commands_covered, '{}'))) THEN 'Missing INSERT policy'
    WHEN NOT ('UPDATE' = ANY(COALESCE(ps.commands_covered, '{}'))) THEN 'Missing UPDATE policy'
    WHEN NOT ('DELETE' = ANY(COALESCE(ps.commands_covered, '{}'))) THEN 'Missing DELETE policy'
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
  'Checks: RLS enabled, policies exist, all DML commands covered. '
  'ALL policies count for all four commands. '
  'tab_audit_log and tab_journal_entry_history are write-protected (trigger-only). '
  'CI check: SELECT count(*) FROM v_rls_coverage WHERE is_rls_compliant = false OR compliance_gap IS NOT NULL; -- must be 0';

GRANT SELECT ON public.v_rls_coverage TO authenticated;

-- Recreate fail_if_rls_gap referencing fixed view
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

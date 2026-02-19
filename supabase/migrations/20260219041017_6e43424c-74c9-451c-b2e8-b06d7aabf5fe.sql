
-- Fix: Drop the view and recreate without SECURITY DEFINER.
-- By default, Postgres views use SECURITY INVOKER (querying user's permissions apply).
-- The v_rls_coverage view only reads system catalogs (pg_tables, pg_policies)
-- which are readable by all roles — no SECURITY DEFINER needed.

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
      ARRAY_AGG(DISTINCT cmd ORDER BY cmd) AS commands_covered,
      COUNT(DISTINCT policyname) AS policy_count
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
  )
SELECT
  t.tablename,
  pt.rowsecurity AS rls_enabled,
  COALESCE(ps.policy_count, 0) AS policy_count,
  COALESCE(ps.commands_covered, '{}') AS commands_covered,
  CASE WHEN rt.tablename IS NOT NULL THEN true ELSE false END AS is_reference_table,
  CASE
    WHEN NOT pt.rowsecurity THEN false
    WHEN ps.policy_count = 0 THEN false
    ELSE true
  END AS is_rls_compliant,
  CASE
    WHEN NOT pt.rowsecurity THEN 'RLS disabled'
    WHEN ps.policy_count = 0 THEN 'No policies defined'
    WHEN rt.tablename IS NULL AND NOT ('SELECT' = ANY(ps.commands_covered)) THEN 'Missing SELECT policy'
    WHEN rt.tablename IS NULL AND NOT ('INSERT' = ANY(ps.commands_covered))
      AND NOT ('ALL' = ANY(ps.commands_covered)) THEN 'Missing INSERT policy'
    WHEN rt.tablename IS NULL AND NOT ('UPDATE' = ANY(ps.commands_covered))
      AND NOT ('ALL' = ANY(ps.commands_covered)) THEN 'Missing UPDATE policy'
    WHEN rt.tablename IS NULL AND NOT ('DELETE' = ANY(ps.commands_covered))
      AND NOT ('ALL' = ANY(ps.commands_covered)) THEN 'Missing DELETE policy'
    ELSE NULL
  END AS compliance_gap
FROM all_tables t
JOIN pg_tables pt ON pt.tablename = t.tablename AND pt.schemaname = 'public'
LEFT JOIN policy_summary ps ON ps.tablename = t.tablename
LEFT JOIN reference_tables rt ON rt.tablename = t.tablename
ORDER BY is_rls_compliant ASC, t.tablename;

COMMENT ON VIEW public.v_rls_coverage IS
  'Tenant isolation audit view (SECURITY INVOKER — runs as calling user). '
  'Any row with is_rls_compliant=false or compliance_gap IS NOT NULL is a problem. '
  'Quick CI check: SELECT count(*) FROM v_rls_coverage WHERE is_rls_compliant = false OR compliance_gap IS NOT NULL;';

-- Re-grant since view was recreated
GRANT SELECT ON public.v_rls_coverage TO authenticated;

-- Update fail_if_rls_gap to not use SECURITY DEFINER (reads only system catalogs via view)
CREATE OR REPLACE FUNCTION public.fail_if_rls_gap()
RETURNS TABLE(
  tablename text,
  rls_enabled boolean,
  policy_count bigint,
  compliance_gap text
)
LANGUAGE sql
-- No SECURITY DEFINER needed: reads from v_rls_coverage which reads pg_catalog
SET search_path = public
AS $$
  SELECT
    tablename,
    rls_enabled,
    policy_count,
    compliance_gap
  FROM public.v_rls_coverage
  WHERE is_rls_compliant = false
     OR compliance_gap IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.fail_if_rls_gap() TO authenticated;

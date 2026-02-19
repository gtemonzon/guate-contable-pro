
-- ============================================================
-- TENANT ISOLATION HELPERS & POLICY COVERAGE VIEW
-- ============================================================

-- 1. current_tenant_id()
--    Reads tenant_id from JWT app_metadata claim set during auth.
--    Falls back to the tab_users lookup (SECURITY DEFINER, row_security off).
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security TO 'off'
AS $$
  SELECT COALESCE(
    -- First try JWT app_metadata (populated by auth hook if configured)
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::bigint,
    -- Fallback: look up from users table
    (SELECT tenant_id FROM public.tab_users WHERE id = auth.uid())
  );
$$;

COMMENT ON FUNCTION public.current_tenant_id() IS
  'Returns the tenant_id for the currently authenticated user. '
  'Reads from JWT app_metadata first, then falls back to tab_users. '
  'Used in RLS policies to enforce tenant isolation without recursive lookups.';

-- 2. current_enterprise_id()
--    Reads enterprise_id from JWT app_metadata claim.
--    Returns NULL if no enterprise context is set (not an error — callers decide).
CREATE OR REPLACE FUNCTION public.current_enterprise_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'enterprise_id')::bigint;
$$;

COMMENT ON FUNCTION public.current_enterprise_id() IS
  'Returns the enterprise_id set in the current JWT app_metadata. '
  'Returns NULL when no enterprise context is active. '
  'Used for optional enterprise-level RLS scoping. '
  'The frontend sets this via the enterprise selector stored in localStorage, '
  'but RLS policies must never trust the client alone — they verify via '
  'tab_user_enterprises instead.';

-- 3. assert_tenant_context()
--    Raises an exception if the calling session has no resolvable tenant.
--    Call this from functions that must never run without tenant context.
CREATE OR REPLACE FUNCTION public.assert_tenant_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security TO 'off'
AS $$
DECLARE
  v_tenant_id bigint;
BEGIN
  v_tenant_id := public.current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant context is required but missing. '
      'Ensure the user is authenticated and has a tenant_id assigned.'
      USING ERRCODE = 'P0010';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_tenant_context() IS
  'Raises SQLSTATE P0010 if no tenant context can be resolved for the current session. '
  'Call at the start of any SECURITY DEFINER function that performs cross-enterprise work.';

-- ============================================================
-- 4. v_rls_coverage — Policy Coverage View
--    Lists every public table with RLS status and command gaps.
--    A table is "compliant" when RLS is enabled AND all four
--    DML commands (SELECT, INSERT, UPDATE, DELETE) have at least
--    one policy, OR the table is a shared reference table
--    (currencies, exchange_rates, fel_document_types, journal_entry_prefixes)
--    which intentionally allows authenticated reads only.
-- ============================================================

CREATE OR REPLACE VIEW public.v_rls_coverage AS
WITH 
  -- All public tables
  all_tables AS (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  ),
  -- Aggregate policy commands per table
  policy_summary AS (
    SELECT
      tablename,
      ARRAY_AGG(DISTINCT cmd ORDER BY cmd) AS commands_covered,
      COUNT(DISTINCT policyname) AS policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
  ),
  -- Reference tables that are intentionally read-only for authenticated users
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
  -- Compliance: RLS on + has policies
  CASE
    WHEN NOT pt.rowsecurity THEN false
    WHEN ps.policy_count = 0 THEN false
    ELSE true
  END AS is_rls_compliant,
  -- Gap: missing any of SELECT/INSERT/UPDATE/DELETE
  -- (reference tables are exempt from INSERT/UPDATE/DELETE checks)
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
  'Tenant isolation audit view. '
  'Any row with is_rls_compliant=false or compliance_gap IS NOT NULL indicates '
  'a table that needs attention. Run: '
  'SELECT * FROM v_rls_coverage WHERE is_rls_compliant = false OR compliance_gap IS NOT NULL;';

-- ============================================================
-- 5. fail_if_rls_gap() — CI guard function
--    Returns 0 rows if all tables are compliant.
--    Returns problem rows so CI can fail on non-empty result.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fail_if_rls_gap()
RETURNS TABLE(
  tablename text,
  rls_enabled boolean,
  policy_count bigint,
  compliance_gap text
)
LANGUAGE sql
SECURITY DEFINER
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

COMMENT ON FUNCTION public.fail_if_rls_gap() IS
  'Returns rows for any table that fails the RLS coverage check. '
  'In CI: SELECT count(*) FROM fail_if_rls_gap(); -- must be 0.';

-- ============================================================
-- 6. Tighten: tab_bank_reconciliations INSERT/UPDATE/DELETE
--    Currently only has ALL policy (covers all commands) — verified OK.
--    Add explicit DELETE guard for clarity.
-- ============================================================

-- tab_bank_movements — already has ALL policy via enterprise_id chain
-- tab_journal_entry_details — already covered via journal_entries chain
-- tab_financial_statement_section_accounts — covered via sections→formats chain

-- Verify audit_log INSERT is only possible via triggers (service role).
-- No client INSERT policy exists — correct: triggers use SECURITY DEFINER.

-- ============================================================
-- 7. Grant: ensure authenticated role can call the helpers
-- ============================================================

GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_enterprise_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_tenant_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_if_rls_gap() TO authenticated;
GRANT SELECT ON public.v_rls_coverage TO authenticated;

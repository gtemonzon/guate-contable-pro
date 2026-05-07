CREATE OR REPLACE VIEW public.v_rls_coverage AS
WITH all_tables AS (
  SELECT pg_tables.tablename
  FROM pg_tables
  WHERE pg_tables.schemaname = 'public'
), policy_summary AS (
  SELECT pg_policies.tablename,
    array_agg(DISTINCT pg_policies.cmd ORDER BY pg_policies.cmd) AS raw_commands,
    count(DISTINCT pg_policies.policyname) AS policy_count,
    bool_or(pg_policies.cmd = 'ALL') AS has_all_policy
  FROM pg_policies
  WHERE pg_policies.schemaname = 'public'
  GROUP BY pg_policies.tablename
), reference_tables(tablename) AS (
  VALUES ('tab_currencies'),('tab_exchange_rates'),('tab_fel_document_types'),('tab_journal_entry_prefixes')
), write_protected_tables(tablename, reason) AS (
  VALUES
    ('tab_audit_log','All writes via audit triggers (SECURITY DEFINER)'),
    ('tab_journal_entry_history','All writes via snapshot trigger (SECURITY DEFINER)'),
    ('tab_backup_history','INSERT only by admins; no client UPDATE/DELETE (immutable records)'),
    ('tab_integrity_validations','INSERT only; no client UPDATE/DELETE (append-only audit records)'),
    ('tab_users','INSERT via handle_new_user trigger (service role); clients cannot self-register'),
    ('audit_event_log','Append-only; triggers block UPDATE/DELETE; INSERT only via write_audit_event() SECURITY DEFINER'),
    ('tab_fx_revaluation_runs','Immutable FX revaluation runs; reversed via dedicated SQL function, never deleted'),
    ('tab_legacy_import_jobs','Job records are append/update only; cleanup handled by SECURITY DEFINER cleanup function'),
    ('tab_training_progress','Per-user toggle: only INSERT/DELETE needed; UPDATE intentionally not allowed'),
    ('tickets','Support tickets are immutable history; closed via UPDATE status, never deleted by clients'),
    ('ticket_messages','Support messages are immutable conversation history; never edited or deleted by clients'),
    ('ticket_attachments','Support message attachments are immutable; never edited or deleted by clients')
)
SELECT t.tablename,
  pt.rowsecurity AS rls_enabled,
  COALESCE(ps.policy_count, 0::bigint) AS policy_count,
  COALESCE(ps.has_all_policy, false) AS has_all_policy,
  COALESCE(ps.raw_commands, '{}'::text[]) AS commands_covered,
  (rt.tablename IS NOT NULL) AS is_reference_table,
  (wp.tablename IS NOT NULL) AS is_write_protected,
  wp.reason AS write_protected_reason,
  CASE
    WHEN NOT pt.rowsecurity THEN false
    WHEN ps.policy_count = 0 THEN false
    ELSE true
  END AS is_rls_compliant,
  CASE
    WHEN NOT pt.rowsecurity THEN 'RLS disabled'
    WHEN ps.policy_count = 0 THEN 'No policies defined'
    WHEN COALESCE(ps.has_all_policy, false) THEN NULL
    WHEN wp.tablename IS NOT NULL THEN NULL
    WHEN rt.tablename IS NOT NULL THEN
      CASE WHEN NOT ('SELECT' = ANY (COALESCE(ps.raw_commands, '{}'::text[]))) THEN 'Missing SELECT policy' ELSE NULL END
    WHEN NOT ('SELECT' = ANY (COALESCE(ps.raw_commands, '{}'::text[]))) THEN 'Missing SELECT policy'
    WHEN NOT ('INSERT' = ANY (COALESCE(ps.raw_commands, '{}'::text[]))) THEN 'Missing INSERT policy'
    WHEN NOT ('UPDATE' = ANY (COALESCE(ps.raw_commands, '{}'::text[]))) THEN 'Missing UPDATE policy'
    WHEN NOT ('DELETE' = ANY (COALESCE(ps.raw_commands, '{}'::text[]))) THEN 'Missing DELETE policy'
    ELSE NULL
  END AS compliance_gap
FROM all_tables t
JOIN pg_tables pt ON pt.tablename = t.tablename AND pt.schemaname = 'public'
LEFT JOIN policy_summary ps ON ps.tablename = t.tablename
LEFT JOIN reference_tables rt ON rt.tablename = t.tablename
LEFT JOIN write_protected_tables wp ON wp.tablename = t.tablename
ORDER BY (CASE WHEN NOT pt.rowsecurity THEN false WHEN ps.policy_count = 0 THEN false ELSE true END), t.tablename;
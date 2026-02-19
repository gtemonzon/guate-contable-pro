# Guate Contable Pro — Security Checklist

> Last updated: 2026-02-19  
> Responsible: Project maintainer / DevOps

---

## 1. Secrets & Environment Variables

| Item | Status | Notes |
|------|--------|-------|
| `.env` is listed in `.gitignore` | ✅ Done | Added 2026-02-19 |
| No private keys committed to git | ✅ Verified | `SUPABASE_SERVICE_ROLE_KEY` lives only in Lovable Cloud secrets |
| Only **publishable** anon key in client code | ✅ Correct | `VITE_SUPABASE_PUBLISHABLE_KEY` is the anon/public key — safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` is a Cloud secret, never in client | ✅ Verified | Used only in Edge Functions via `Deno.env.get()` |
| Rotate keys if ever accidentally committed | ⚠️ Manual step | See §1.1 below |

### 1.1 How to rotate Supabase keys

If a service-role key or JWT secret is ever exposed:

1. Go to **Lovable Cloud → Backend → Settings → API Keys** and regenerate the JWT secret.
2. Update all Cloud secrets (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`) to the new values.
3. Redeploy Edge Functions so they pick up the new secrets.
4. Revoke the old key from the Supabase dashboard immediately.

### 1.2 Local development environment setup

Create a `.env` file locally (never committed):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>   # Safe — public key
VITE_SUPABASE_PROJECT_ID=<project-ref>
```

> ⚠️ Never add `SUPABASE_SERVICE_ROLE_KEY` to `.env`. It belongs only in server-side secrets.

---

## 2. Edge Function Authentication

Both Edge Functions (`parse-tax-form-pdf`, `parse-purchases-pdf`) use the **getClaims() pattern**:

| Item | Status | Notes |
|------|--------|-------|
| `verify_jwt = false` in `config.toml` | ✅ Intentional | Required for the `getClaims()` signing-key approach |
| JWT validated manually via `getClaims(token)` | ✅ Implemented | Returns 401 if token is missing, malformed, or expired |
| Request body size limit (5 MB) | ✅ Implemented | Returns 413 on oversized input |
| Input type validation (`typeof pdfText !== "string"`) | ✅ Implemented | Returns 400 on bad input |

> **Why `verify_jwt = false`?**  
> Supabase's built-in `verify_jwt = true` uses a deprecated approach incompatible with signing-keys.  
> The correct pattern is `verify_jwt = false` + manual `getClaims()` validation in code.  
> See: https://supabase.com/docs/guides/functions/auth

### Recommended future hardening for Edge Functions

- [ ] Add per-user rate limiting (e.g., max 10 PDF parses/minute) using a Redis counter or Supabase DB table
- [ ] Log all parse attempts to `tab_audit_log` with user ID and file size
- [ ] Consider CORS origin restriction: change `Access-Control-Allow-Origin: *` to your production domain

---

## 3. Row-Level Security (RLS)

### 3.1 RLS Coverage

All 42 public tables have RLS enabled. Verified with:

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;
-- Should return 0 rows
```

### 3.2 Reference Tables — Restricted (2026-02-19)

Previously these tables allowed anonymous (unauthenticated) reads. Now restricted to `authenticated` role:

| Table | Previous Policy | New Policy |
|-------|----------------|-----------|
| `tab_currencies` | `true` (public) | `TO authenticated` |
| `tab_exchange_rates` | `true` (public) | `TO authenticated` |
| `tab_fel_document_types` | `true` (public) | `TO authenticated` |
| `tab_journal_entry_prefixes` | `true` (public) | `TO authenticated` |

### 3.3 Tenant + Enterprise Isolation Pattern

Every data table follows this isolation pattern:

```sql
-- Enterprise-scoped data
USING (enterprise_id IN (
  SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid()
))

-- Tenant-scoped data
USING (is_super_admin(auth.uid()) OR get_user_tenant_id(auth.uid()) = tenant_id)
```

### 3.4 Detect Unprotected Tables (run periodically)

```sql
-- Tables with RLS disabled
SELECT tablename 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;

-- Policies allowing unauthenticated access
SELECT tablename, policyname, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true';
```

Expected result: **0 rows** for both queries.

### 3.5 Security Functions (SECURITY DEFINER)

Critical auth helpers bypass RLS safely via `SET row_security TO off`:

- `is_super_admin(uuid)` 
- `is_tenant_admin_for(uuid, bigint)`
- `get_user_tenant_id(uuid)`
- `can_access_tenant(uuid, bigint)`
- `get_enterprise_tenant_id(bigint)`
- `user_is_linked_to_enterprise(uuid, bigint)`

These prevent infinite recursion in RLS policies. **Never** inline these checks directly in policies.

---

## 4. Authentication

| Item | Status | Notes |
|------|--------|-------|
| Public registration disabled | ✅ Done | Users must be invited by admins |
| Email confirmation required | ✅ Default | Auto-confirm is `false` |
| Roles stored in separate `user_roles` table | ✅ Done | Not in profile/users table (prevents privilege escalation) |
| Role checks use `SECURITY DEFINER` functions | ✅ Done | No client-side role trust |
| `is_system_user` protects master accounts | ✅ Done | Non-system admins cannot modify system users |
| **Leaked password protection** | ⚠️ PENDING | See §4.1 |

### 4.1 Enable Leaked Password Protection (Manual Step Required)

This setting must be enabled in Supabase Auth settings:

1. Go to **Lovable Cloud → Backend → Auth → Settings**
2. Enable **"Check for leaked passwords"** (HaveIBeenPwned integration)
3. This prevents users from setting passwords that have appeared in known data breaches.

---

## 5. Data Security

| Item | Status | Notes |
|------|--------|-------|
| Backup files excluded from git | ✅ Done | `*.backup.json` in `.gitignore` |
| Backup files contain sensitive accounting data | ⚠️ Warning | Store downloads securely; do not email |
| PDF uploads (tax forms, purchases) are private | ✅ Done | Storage buckets `enterprise-documents` and `tax-forms` are non-public |
| `tenant-logos` bucket is public | ✅ Intentional | Contains only logo images |
| No raw SQL execution in Edge Functions | ✅ Verified | Only typed Supabase client APIs used |

---

## 6. Periodic Security Tasks

| Frequency | Task |
|-----------|------|
| Monthly | Run `pg_policies` audit query (§3.4) |
| Monthly | Review `tab_audit_log` for suspicious patterns |
| Quarterly | Rotate service role keys |
| Quarterly | Review and prune inactive user accounts |
| On each deploy | Verify Edge Function auth still returns 401 for unauthenticated requests |
| On each deploy | Run Lovable security scanner |

---

## 7. Incident Response

If a security breach is suspected:

1. **Immediately** rotate all API keys (§1.1)
2. Review `tab_audit_log` for the affected `enterprise_id` and time window
3. Check `tab_users.last_activity_at` for anomalous login times
4. Notify affected tenant admins
5. Document the incident and remediation steps

---

## 9. Tenant Isolation Contract

### 9.1 The Contract

Every row in every business table is scoped by the authenticated user's **tenant** and **enterprise** context. No frontend filtering can substitute for this — the database is the last line of defense.

| Guarantee | Mechanism |
|-----------|-----------|
| A user can only read rows from their own tenant | RLS policies join through `tab_user_enterprises` or `tab_enterprises.tenant_id` |
| A user can only write rows for enterprises they are linked to | `WITH CHECK` constraints on `tab_user_enterprises` membership |
| Posted entries are immutable | `trg_journal_entry_immutability` trigger (ERRCODE P0001) |
| Posting unbalanced entries is blocked | `trg_enforce_balanced_on_post` trigger (ERRCODE P0002) |
| Posting to closed periods is blocked | `trg_enforce_open_period_on_post` trigger (ERRCODE P0004) |
| No row can be written without a resolvable tenant | `assert_tenant_context()` guard in all cross-enterprise functions |

### 9.2 Tenant Isolation Helpers

Three SECURITY DEFINER helper functions enforce isolation:

```sql
-- Returns tenant_id for the current session (JWT → tab_users fallback)
SELECT public.current_tenant_id();

-- Returns enterprise_id from JWT app_metadata (NULL if not set)
SELECT public.current_enterprise_id();

-- Raises SQLSTATE P0010 if tenant context is missing
PERFORM public.assert_tenant_context();
```

Call `assert_tenant_context()` at the start of any `SECURITY DEFINER` function that performs cross-tenant operations.

### 9.3 Isolation Scoping by Table Category

| Category | Scope Key | How Isolated |
|----------|-----------|--------------|
| Business data (entries, accounts, ledger…) | `enterprise_id` | `enterprise_id IN (SELECT enterprise_id FROM tab_user_enterprises WHERE user_id = auth.uid())` |
| Enterprise metadata | `tenant_id` (via `tab_enterprises`) | `get_enterprise_tenant_id()` + `can_access_tenant()` |
| User data | `tenant_id` (on `tab_users`) | `is_tenant_admin_for()` or `id = auth.uid()` |
| Join tables (e.g. journal_entry_details) | FK chain → `enterprise_id` | Parent FK lookup through `tab_journal_entries` |
| Reference tables (currencies, etc.) | None — shared global | Read-only for `authenticated`, write-only for `super_admin` |
| Write-protected (audit_log, entry_history) | `enterprise_id` | Write only via SECURITY DEFINER triggers; clients can only SELECT |

### 9.4 Frontend Must Not Be Trusted for Isolation

The `currentEnterpriseId` in `localStorage` is used for **UX context only** (determining which data to show). It is **never** used in RLS policies. All isolation decisions happen server-side via `tab_user_enterprises` membership checks.

---

## 10. Policy Coverage Check

### 10.1 Audit View

```sql
-- Show all tables with their RLS coverage status
SELECT * FROM public.v_rls_coverage ORDER BY tablename;

-- Show only problem tables (must return 0 rows in a healthy system)
SELECT tablename, rls_enabled, policy_count, compliance_gap
FROM public.v_rls_coverage
WHERE is_rls_compliant = false OR compliance_gap IS NOT NULL;
```

### 10.2 CI Guard Function

```sql
-- Returns 0 rows when all tables are compliant.
-- In CI pipelines, fail if this returns any rows:
SELECT count(*) FROM public.fail_if_rls_gap(); -- must be 0
```

### 10.3 Column Definitions

| Column | Meaning |
|--------|---------|
| `rls_enabled` | Whether `ALTER TABLE … ENABLE ROW LEVEL SECURITY` has been run |
| `policy_count` | Number of policies (an `ALL` policy counts as 1) |
| `has_all_policy` | Table has a policy covering all DML commands at once |
| `is_reference_table` | Intentionally shared (currencies, exchange rates, etc.) — only SELECT needed |
| `is_write_protected` | Writes only allowed via triggers (audit_log, entry_history) |
| `is_rls_compliant` | `true` when RLS is on AND at least one policy exists |
| `compliance_gap` | `NULL` means fully covered; non-NULL describes the missing protection |

### 10.4 Run Periodically

Add to your monthly security checklist:

```bash
# Via psql
psql "$DATABASE_URL" -c "SELECT count(*) FROM fail_if_rls_gap();"
# Expected output: count = 0
```

### 10.5 What to Do When a Gap is Found

1. Identify the table and gap type from `v_rls_coverage`
2. Create a migration adding the missing RLS policy
3. Re-run `fail_if_rls_gap()` to verify count = 0
4. Document the new policy in this file under §3

---

## 8. Dependency Security

```bash
# Check for known vulnerabilities in npm packages
npm audit

# Update dependencies
npm update
```

Run `npm audit` before each production release. Address `high` and `critical` severity findings immediately.

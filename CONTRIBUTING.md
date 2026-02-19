# Contributing to Guate Contable Pro

> Last updated: 2026-02-19

Welcome! This guide explains how to set up your local environment, run quality checks, and contribute safely.

---

## 1. Prerequisites

| Tool | Minimum version |
|------|----------------|
| [Bun](https://bun.sh) | 1.1+ |
| Node.js | 20+ (used internally by some tools) |
| Git | 2.40+ |

---

## 2. Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/<org>/guate-contable-pro.git
cd guate-contable-pro

# 2. Install dependencies
bun install

# 3. Create your local .env (NEVER commit this file)
cp .env.example .env
# Then fill in VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PROJECT_ID

# 4. Start the development server
bun run dev
```

> ⚠️ **Never add `SUPABASE_SERVICE_ROLE_KEY` to `.env`.**  
> It belongs only in backend secrets (Lovable Cloud → Backend → Settings).

---

## 3. Quality Gate — Running Locally

Before pushing, run the same checks the CI pipeline enforces:

```bash
# Type-check
bun run tsc --noEmit

# Lint
bun run lint

# Build (catches bundler errors)
bun run build

# Unit tests (if configured)
bun run test --run
```

All four must pass before a PR will be merged.

---

## 4. Secret Scanning

The CI pipeline (`.github/workflows/ci.yml`) rejects commits that:

- Include `.env` files (other than `.env.example`)
- Match known secret patterns (service role keys, private keys, Stripe live keys)

### 4.1 Setting Up the Pre-Commit Hook (recommended)

The `.husky/pre-commit` hook runs the same secret checks locally so you catch issues before they ever reach CI.

```bash
# One-time setup
npx husky install

# Make the hook executable
chmod +x .husky/pre-commit
```

After this, every `git commit` will automatically scan staged files for secrets.

### 4.2 Adding New Secret Patterns

1. Add the regex to `.github/secret-patterns.txt` (documentation).
2. Add the same pattern to the `SECRET_PATTERNS` array in `.github/workflows/ci.yml`.
3. Optionally add it to `.husky/pre-commit` for local protection.

---

## 5. CI Pipeline Overview

```
Push / PR
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  quality-gate job                                    │
│  1. Check for committed .env files          → fail  │
│  2. Scan for secret patterns                → fail  │
│  3. bun install --frozen-lockfile                    │
│  4. tsc --noEmit (type check)               → fail  │
│  5. bun run lint (ESLint)                   → fail  │
│  6. bun run build                           → fail  │
│  7. Build size report                                │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌───────────────┐
│  unit-tests   │
│  bun run test │
└───────────────┘
```

The pipeline uses placeholder env vars so the build succeeds even without production secrets. For tests that require a real backend, use GitHub repository secrets.

### Adding GitHub Secrets for CI

In your GitHub repository: **Settings → Secrets and variables → Actions → New repository secret**

| Secret Name | Where to find it |
|-------------|-----------------|
| `VITE_SUPABASE_URL` | Lovable Cloud → Backend → Settings → API |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Lovable Cloud → Backend → Settings → API (anon key) |
| `VITE_SUPABASE_PROJECT_ID` | Lovable Cloud → Backend → Settings |

> ⚠️ Never add `SUPABASE_SERVICE_ROLE_KEY` as a CI secret unless it's absolutely required by a test and the secret is scoped to protected branches only.

---

## 6. Runtime Health Check

After logging in, super-admins and tenant admins can access the system health check under:

**Configuración → Estado del Sistema**

This page verifies:
- ✅ All required env vars are present
- ✅ Backend connectivity
- ✅ Active user session
- ✅ Tenant context (user has a tenant_id assigned)
- ✅ Active enterprise context
- ✅ RLS coverage (no unprotected tables)

If any check fails, the page shows an actionable warning explaining what to fix.

---

## 7. Database Migrations

All schema changes go through the migration tool — **never edit `supabase/migrations/` files directly**.

```bash
# Review pending migrations
ls supabase/migrations/

# Migrations are applied automatically via the Lovable Cloud migration tool.
# Never run raw `psql` against production without approval.
```

---

## 8. Pull Request Checklist

Before opening a PR, confirm:

- [ ] `bun run tsc --noEmit` passes
- [ ] `bun run lint` passes  
- [ ] `bun run build` succeeds
- [ ] No `.env` files staged
- [ ] No hardcoded secrets in code
- [ ] New tables have RLS enabled + policies
- [ ] SECURITY.md updated if new security decisions were made
- [ ] `fail_if_rls_gap()` returns 0 rows if DB changes were made

---

## 9. Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — protected, requires PR + CI green |
| `develop` | Integration branch |
| `feature/<name>` | Feature work |
| `hotfix/<name>` | Urgent production fixes |

---

## 10. Code Style

- **TypeScript** — strict mode; no `any` unless justified with a comment
- **Tailwind** — use semantic design tokens from `index.css`; never hardcode colors
- **Components** — keep files under 300 lines; extract sub-components early
- **Queries** — use the Supabase typed client; never concatenate raw SQL in the frontend

---

## 11. Reporting Security Issues

**Do not open a public GitHub issue for security vulnerabilities.**

Email the maintainer directly or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability).

See `SECURITY.md` for the full incident response process.
